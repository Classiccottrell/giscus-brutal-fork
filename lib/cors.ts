import { NextApiRequest, NextApiResponse } from 'next';
import { assertOrigin } from './config';
import { env } from './variables';

export function addCorsHeaders(req: NextApiRequest, res: NextApiResponse) {
  const config = {
    origins: env.origins,
    originsRegex: env.origins_regex,
  };

  const origin = req.headers.origin;

  // res.setHeader throws on an undefined value (e.g. a same-origin request,
  // which never sends an Origin header) — never pass one through unchecked.
  // A same-origin request also has no need for this header at all: browsers
  // only consult Access-Control-Allow-Origin for cross-origin requests.
  if (assertOrigin(origin, config) && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (config.origins[0]) {
    res.setHeader('Access-Control-Allow-Origin', config.origins[0]);
  }
}
