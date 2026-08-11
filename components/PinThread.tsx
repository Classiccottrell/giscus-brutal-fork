import { useContext, useMemo } from 'react';
import { AuthContext, ConfigContext } from '../lib/context';
import { useGiscusTranslation } from '../lib/i18n';
import { IComment } from '../lib/types/adapter';
import { useFrontBackDiscussion } from '../services/giscus/discussions';
import Comment from './Comment';
import CommentBox from './CommentBox';

// Cross-repo string contract (CLICK_TO_COMMENT_SPEC.md §6) — the parent app's
// marker regex (lib/comments/marker.ts on the Brutal-UX side) must match this
// exactly. No shared import is possible across the two codebases.
const PIN_MARKER_RE = /^<!--\s*pin:\s*data-comment-id="([^"]+)"\s*-->/;

function isPinnedTo(comment: IComment, elementId: string): boolean {
  const match = comment.body?.match(PIN_MARKER_RE);
  return !!match && match[1] === elementId;
}

interface IPinThreadProps {
  elementId: string;
  onDiscussionCreateRequest?: () => Promise<string>;
  onError?: (message: string) => void;
}

export default function PinThread({
  elementId,
  onDiscussionCreateRequest,
  onError,
}: IPinThreadProps) {
  const { token } = useContext(AuthContext);
  const { t } = useGiscusTranslation();
  const { repo, term, number, category, strict } = useContext(ConfigContext);
  const query = { repo, term, category, number, strict };

  const { addNewComment, frontMutators, backMutators, ...data } = useFrontBackDiscussion(
    query,
    token,
    'oldest',
  );

  const pinnedFrontComments = useMemo(
    () => data.frontComments.filter((comment) => isPinnedTo(comment, elementId)),
    [data.frontComments, elementId],
  );
  const pinnedBackComments = useMemo(
    () => data.backComments.filter((comment) => isPinnedTo(comment, elementId)),
    [data.backComments, elementId],
  );
  const hasPinnedComments = pinnedFrontComments.length > 0 || pinnedBackComments.length > 0;

  if (data.error && onError) {
    onError(data.error?.message);
  }

  const handleDiscussionCreateRequest = async () => {
    const id = await onDiscussionCreateRequest();
    // Force revalidate, same as Giscus.tsx's wrapper.
    frontMutators.mutate();
    backMutators.mutate();
    return id;
  };

  const shouldCreateDiscussion = data.isNotFound && !number;
  const shouldShowCommentBox =
    (data.isRateLimited && !token) ||
    (!data.isLoading && !data.isLocked && (!data.error || (data.isNotFound && !number)));

  if (data.isLoading) {
    return (
      <div className="gsc-loading">
        <div className="gsc-loading-image" />
        <span className="gsc-loading-text color-fg-muted">{t('loadingComments')}</span>
      </div>
    );
  }

  return (
    <div className="color-text-primary gsc-main">
      <div className="gsc-comments">
        {!hasPinnedComments && !shouldCreateDiscussion ? (
          <p className="color-text-secondary text-sm">No comments yet on this element.</p>
        ) : null}

        <div className={`gsc-timeline ${!hasPinnedComments ? 'hidden' : ''}`}>
          {pinnedFrontComments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              replyBox={
                token && !data.isLocked ? (
                  <CommentBox
                    discussionId={data.discussion.id}
                    context={repo}
                    onSubmit={frontMutators.addNewReply}
                    replyToId={comment.id}
                  />
                ) : undefined
              }
              onCommentUpdate={frontMutators.updateComment}
              onReplyUpdate={frontMutators.updateReply}
            />
          ))}
          {pinnedBackComments.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              replyBox={
                token && !data.isLocked ? (
                  <CommentBox
                    discussionId={data.discussion.id}
                    context={repo}
                    onSubmit={backMutators.addNewReply}
                    replyToId={comment.id}
                  />
                ) : undefined
              }
              onCommentUpdate={backMutators.updateComment}
              onReplyUpdate={backMutators.updateReply}
            />
          ))}
        </div>

        {shouldShowCommentBox ? (
          <CommentBox
            discussionId={data.discussion.id}
            context={repo}
            onSubmit={addNewComment}
            onDiscussionCreateRequest={handleDiscussionCreateRequest}
            bodyPrefix={`<!-- pin: data-comment-id="${elementId}" -->`}
          />
        ) : null}
      </div>
    </div>
  );
}
