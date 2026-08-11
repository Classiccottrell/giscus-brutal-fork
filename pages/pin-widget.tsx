import { GetServerSidePropsContext, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import { useCallback, useContext, useEffect, useState } from 'react';
import PinThread from '../components/PinThread';
import { assertOrigin } from '../lib/config';
import { AuthContext, ConfigContext, getLoginUrl, ThemeContext } from '../lib/context';
import { emitData } from '../lib/messages';
import { decodeState } from '../lib/oauth/state';
import { IErrorMessage, IResizeHeightMessage, ISignOutMessage } from '../lib/types/giscus';
import { cleanAnchor, cleanSessionParam, getOriginHost } from '../lib/utils';
import { env, Theme } from '../lib/variables';
import { getAppAccessToken } from '../services/github/getAppAccessToken';
import { getRepoConfig } from '../services/github/getConfig';
import { createDiscussion } from '../services/giscus/createDiscussion';
import { getToken } from '../services/giscus/token';

export async function getServerSideProps({ query, res }: GetServerSidePropsContext) {
  const session = (query.session as string) || '';
  const repo = (query.repo as string) || '';
  const term = cleanSessionParam((query.term as string) || '');
  const category = (query.category as string) || '';
  const number = +query.number || 0;
  const strict = Boolean(+query.strict);
  const repoId = (query.repoId as string) || '';
  const categoryId = (query.categoryId as string) || '';
  const description = (query.description as string) || '';
  const elementId = (query.elementId as string) || '';
  const theme = ((query.theme as string) || 'preferred_color_scheme') as Theme;
  const { origin, originHost } = getOriginHost((query.origin as string) || '');
  const backLink = (query.backLink as string) || origin;

  const { encryption_password } = env;
  const token = await decodeState(session, encryption_password)
    .catch(() => getAppAccessToken(repo))
    .catch(() => '');

  const repoConfig = await getRepoConfig(repo, token);

  // Opt into CORP. See: https://web.dev/articles/coop-coep
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (!assertOrigin(originHost, repoConfig)) {
    res.setHeader('Content-Security-Policy', `frame-ancestors 'none';`);
    res.setHeader('X-Frame-Options', 'DENY');
    return {
      redirect: {
        destination: 'https://github.com/orgs/giscus/discussions/1298',
        permanent: false,
      },
    };
  } else {
    let origins = repoConfig.origins || [];
    if (origins.indexOf(originHost) === -1) {
      origins = [...origins, originHost];
    }
    const originsStr = origins.join(' ');

    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${originsStr};`);
  }

  return {
    props: {
      origin,
      session,
      repo,
      term,
      category,
      number,
      strict,
      repoId,
      categoryId,
      description,
      elementId,
      theme,
      backLink,
    },
  };
}

export default function PinWidgetPage({
  origin,
  session,
  repo,
  term,
  number,
  category,
  strict,
  repoId,
  categoryId,
  description,
  elementId,
  theme,
  backLink,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const resolvedOrigin = origin || (typeof location === 'undefined' ? '' : location.href);
  const { setTheme } = useContext(ThemeContext);
  const [token, setToken] = useState('');
  const [createDiscussionPromise, setCreateDiscussionPromise] = useState<Promise<string>>();

  const handleError = useCallback(
    (message: string) => {
      emitData<IErrorMessage>({ error: message }, resolvedOrigin);
    },
    [resolvedOrigin],
  );

  const handleSignOut = useCallback(() => {
    emitData<ISignOutMessage & IErrorMessage>(
      { signOut: true, error: 'State has expired (user signed out).' },
      resolvedOrigin,
    );
  }, [resolvedOrigin]);

  useEffect(() => setTheme(theme), [setTheme, theme]);

  // Mirrors Widget.tsx's own resize signal — the parent can't measure a
  // cross-origin iframe's content directly, so it needs this to size the
  // popover responsively instead of a fixed guess.
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      emitData<IResizeHeightMessage>(
        { resizeHeight: Math.ceil(entry.contentRect.height) },
        resolvedOrigin,
      );
    });

    observer.observe(document.querySelector('body'));
    return () => observer.disconnect();
  }, [resolvedOrigin]);

  useEffect(() => {
    if (session && !token) {
      getToken(session)
        .then(setToken)
        .catch((err) => handleError(err?.message));
    }
  }, [handleError, session, token]);

  const handleDiscussionCreateRequest = async () => {
    if (createDiscussionPromise) return createDiscussionPromise;

    // Reuses services/giscus/createDiscussion.ts exactly as Widget.tsx does —
    // shares the page-level widget's Discussion (same repo/term/category),
    // never creates a pin-specific one.
    const promise = createDiscussion(token, repo, {
      repositoryId: repoId,
      categoryId,
      title: term,
      body: `# ${term}\n\n${description || ''}\n\n${cleanAnchor(backLink || origin)}`,
    });
    setCreateDiscussionPromise(promise);

    return promise;
  };

  const ready = (!session || token) && repo && (term || number);

  if (!elementId) {
    return (
      <>
        <Head>
          <title>giscus</title>
        </Head>
        <main className="w-full mx-auto p-4">
          <p className="color-text-secondary text-sm">Missing elementId.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <base target="_top" />
        <title>giscus</title>
      </Head>

      <main className="w-full mx-auto" data-theme={theme}>
        <ConfigContext.Provider
          value={{
            repo,
            repoId,
            category,
            categoryId,
            description,
            backLink,
            term,
            number,
            strict,
            reactionsEnabled: false,
            emitMetadata: false,
            inputPosition: 'bottom',
            defaultCommentOrder: 'oldest',
          }}
        >
          {ready ? (
            <AuthContext.Provider
              value={{ token, origin: resolvedOrigin, getLoginUrl, onSignOut: handleSignOut }}
            >
              <PinThread
                elementId={elementId}
                onDiscussionCreateRequest={handleDiscussionCreateRequest}
                onError={handleError}
              />
            </AuthContext.Provider>
          ) : null}
        </ConfigContext.Provider>
      </main>
    </>
  );
}
