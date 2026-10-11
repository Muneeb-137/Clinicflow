import { useState } from "react";

import {
  getSessionExpired,
  type Portal,
} from "../lib/api";

/*
 * Shown on a login page when the user was sent there
 * because their session ran out.
 */
function SessionExpiredNotice({
  portal,
}: {
  portal: Portal;
}) {
  const [expired] = useState(
    () => getSessionExpired(portal) !== null,
  );

  if (!expired) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
      Your session expired. Please sign in again to
      continue where you left off.
    </div>
  );
}

export default SessionExpiredNotice;
