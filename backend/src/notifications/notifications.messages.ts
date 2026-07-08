// Notification content — a single `{ title, body }` shape built per notification type / email kind
// (implementation plan Phase 4). The same content is used verbatim for the durable in-app inbox row and,
// reused as-is (title → subject, body → text), for the recipient's email — one build, two deliveries, no
// second copy to drift.
export interface NotificationContent {
  title: string;
  body: string;
}

// A stored calendar date is UTC midnight (see standups/localDate.ts); its calendar date is the leading
// ISO segment, locale-independent and stable — same convention as insights.prompt.ts.
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Phase 5 — a member's local-morning nudge to post their update for their current local day. */
export function buildReminderMessage(localStandupDate: Date): NotificationContent {
  return {
    title: "Time for your daily standup",
    body: `You haven't posted your update for ${formatDate(localStandupDate)} yet. Share yesterday, today, and any blockers when you get a chance.`,
  };
}

/** Phase 6 — a lead/admin alert for a new or persistent blocker on a teammate's update. */
export function buildBlockerAlertMessage(params: {
  memberName: string;
  blockers: string;
  persistent: boolean;
}): NotificationContent {
  const title = params.persistent
    ? `Persistent blocker: ${params.memberName}`
    : `New blocker: ${params.memberName}`;
  return { title, body: params.blockers };
}

/** Phase 4 — the invite email upgraded from the dev-safe log stub to real content. */
export function buildInviteEmail(url: string): NotificationContent {
  return {
    title: "You're invited to Standup Tracker",
    body: `You've been invited to join a team on Standup Tracker. Accept your invite to get started: ${url}`,
  };
}

/** Phase 4 — the password-reset email upgraded from the dev-safe log stub to real content. */
export function buildPasswordResetEmail(url: string): NotificationContent {
  return {
    title: "Reset your Standup Tracker password",
    body: `Reset your password using this link: ${url}. If you did not request this, you can safely ignore this email.`,
  };
}
