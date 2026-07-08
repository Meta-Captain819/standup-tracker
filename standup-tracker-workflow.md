# Standup Tracker — How the App Works, From Start to Finish

This is a plain-language walkthrough of a small tool called **Standup Tracker**. Its job is simple: instead of daily updates getting lost in a busy chat channel, every team member drops their update into one tidy place, and their lead can see the whole team's progress in a single glance. No message hunting, no "wait, what did you say you were stuck on last Tuesday?"

The app is organised around teams. Each company or team gets its own private space, set up by whoever signs up to start it. That person becomes the team's admin and owner, and everyone else on the team gets an account created for them. The rest of this document follows the app the way you'd actually experience it — the moment you open it, how the owner sets up the team, how members get in, and what everyone does each day. Near the end, it explains in everyday terms how the app stays quick, keeps each team's information private, copes with lots of people using it at once, and picks itself back up when something goes wrong.

---

## A few decisions this version makes

The brief deliberately left some choices open, so here's how this version answers them, in one place, before the walkthrough begins:

- **Sign-up creates a team, not just a person.** When someone signs up, they're starting a new team as its owner and admin. Team members don't sign themselves up — the admin creates their accounts from the dashboard. So there's always a clear owner, and every account belongs to exactly one team.
- **Posting nothing is itself information.** If you skip a day, you aren't hidden — your lead sees a clear "no update yet" marker next to your name, which is exactly the kind of gap a lead wants to notice.
- **You can edit today's update.** People remember things after they hit submit, so edits are allowed for the current day. When you edit, the lead can tell it was changed and can see the latest version.
- **"Today" belongs to the person, and the app works it out on its own.** A teammate finishing their morning in one part of the world and a teammate just starting theirs elsewhere can be on different calendar days at the same moment. The app figures out each person's day quietly in the background and never asks anyone to fiddle with time zones.
- **"At a glance" means one screen with the answers already worked out** — who's on track, who's stuck, and what deserves a second look — rather than a wall of raw text the lead has to read through.

---

## The moment you open the app

When you first arrive, you land on a calm welcome screen. It says what the tool is for in a sentence or two and gives you two clear doors: **sign in** if you already have an account, or **start a new team** if you're setting one up for the first time. There's nothing to read through and no clutter. The goal is to get you to your own update in seconds, because a standup tool that feels like a chore is a standup tool people quietly abandon.

That "start a new team" door is for a company owner or team admin. Everyday members don't need it — their account is made for them, so they only ever use the "sign in" door.

If you've used the app before on this device and haven't signed out, it remembers you and skips straight past this screen to your home page. You only see the welcome screen when the app genuinely doesn't know who you are yet.

---

## Starting a new team, and getting members in

There are two ways an account comes to exist, and they're deliberately different.

**The owner starts the team.** When someone chooses "start a new team," they give their name, their email, a password, and a name for the team or company. That single step does two things at once: it creates a fresh, private space for that team, and it makes that person the team's admin and owner. From that moment on, the whole space belongs to them and their team, walled off from every other team using the app.

**The admin creates everyone else.** Members never sign themselves up. Instead, the admin goes into the dashboard and adds them — just a name and an email each. The app then sends each new member an invite to set their own password and step in. When a member accepts and picks a password, their account is ready and tied to that one team. This keeps the roster clean and under the admin's control: only people the admin actually added can get in, and there are no stray self-registered accounts floating around.

**Signing in** afterwards is the same for everybody — email and password. If anyone forgets their password, there's the usual "forgot password" path that emails them a way to set a new one. Once you're in, the app keeps you signed in for a good while so you're not re-entering your password every morning, but it will ask again after enough time has passed or if you sign out on purpose.

Notice what the app *doesn't* ask: it never asks anyone where they are or what their time zone is. That's handled quietly behind the scenes, which the time zone section explains later.

---

## The people using it: owner-admins, leads, and members

There are a few roles, and they shape everything you see.

The **owner-admin** is the person who started the team. They can do everything: create and remove member accounts, decide who's a plain member and who's a lead, see every update, and use the AI assistant. This is the person running the show.

A **team member** is the everyday user. They come in, write their update, maybe glance at their own recent history, and leave. Their world is their own — they see their own updates, not the whole team's.

A **lead** is a member the admin has given the wider view. Leads can see the full team dashboard and the AI assistant, just like the admin, so that "team leads should be able to view all updates in one place" holds true — but they don't run the account admin side. The admin decides who gets this by flipping a member into a lead when needed.

The app decides which screens you get based on your role, and it never shows a member the lead-only or admin-only areas. If a member somehow tries to reach a page that isn't theirs, the app simply turns them around with a friendly "this area isn't available to you" message rather than exposing anything.

---

## A team member's day: the home screen

When a member signs in, they land on their **home screen**, and the app has already done a little thinking for them. Front and centre is one of two things: either today's update, already written and shown back to them so they can confirm or tweak it, or — if they haven't written it yet — a clean, inviting form waiting to be filled in.

The screen also shows, quietly off to the side, their last few days of updates, so yesterday's plan is right there when they're deciding what to write for today. There's no digging required to remember what they said they'd do.

Everything on this screen is framed around *their* current day, which the app has already worked out on its own. So a member opening the app in the middle of their working week sees the right "today" for where they are, even if a colleague on the other side of the world is still on the previous date.

---

## Writing today's update: the three questions

This is the heart of the app, and it's intentionally tiny. The update form asks three plain questions:

**What did you finish yesterday?** — a space to jot what actually got done.

**What are you working on today?** — the plan for the day.

**Anything blocking you?** — the honest bit, where you say what's slowing you down or standing in your way.

You type into each one, and you send it off with a single confirm. The app is relaxed about how much you write — a few words is fine, and the blocker box can be left empty on a smooth day. What it won't accept is a completely blank submission where all three are empty, because an empty update tells nobody anything; in that case it gently nudges you to write at least something before sending.

The instant you submit, the app stamps the update with *your* current day and the exact moment you sent it, files it under your name, and shows it back to you as "today's update — done." That confirmation matters: you should never wonder whether it saved.

---

## How "today" knows where you are

This is the part that quietly does the heavy lifting, so it's worth slowing down on — but the important thing to know first is that *the user never has to think about it at all*. Nobody is ever asked where they are or what time zone they're in.

Every person on the team effectively carries their own clock, and the app works out which day they're living in on its own. When a member submits an update, the app doesn't ask "what day is it at headquarters?" — it treats the update as belonging to the day the *writer* is actually in, right where they are, right then. So one teammate finishing their morning can already be on Tuesday while another, at the very same moment, is still winding down Monday evening. Both are correct, and the app records each update against the day its writer was really living.

The upshot for a member is that they just see "today," and "today" is genuinely their today. All the fiddly cross-time-zone bookkeeping — making sure everyone's day and every timestamp line up correctly — is the app's job to get right internally, not something anyone types in or configures. It's handled from the ground up so that it simply works.

---

## Changing your mind: editing an update

People remember things five minutes after they submit — a task they forgot, a blocker that just cleared. So today's update stays editable. A member opens their home screen, sees today's update, changes the wording, and re-confirms. The app keeps the newest version as the one that counts and quietly notes that the update was touched again and when.

On the lead's side, an edited update shows the current, up-to-date text, with a small marker that it was updated after first being posted. That way a lead who read an early version in the morning isn't misled by stale wording later — they can tell it changed and trust that what they're looking at is the latest. Editing is limited to the current day; once the day has passed for that person, their update becomes part of the record and settles into history rather than staying open forever.

---

## When someone posts nothing

Silence is handled on purpose, because silence is often the most useful signal a lead gets. If a member hasn't written anything for their current day, the app doesn't leave a blank space or pretend they don't exist. On the lead's dashboard, that person appears with a clear **"no update yet"** marker beside their name.

This is deliberate. A lead scanning the team should be able to spot, in a second, who hasn't checked in — that's frequently the person who's overwhelmed, out sick, or stuck on something they haven't found the words for. Turning absence into a visible, gentle flag is far more helpful than hiding it.

---

## The team lead's dashboard: the whole team at a glance

Now to the lead and admin side, which is where the app earns its keep.

When a lead or admin signs in, they land on the **team dashboard**: every team member laid out together, each showing their latest update — what they finished, what they're on today, and what's blocking them. It's one screen, scannable top to bottom, no scrolling through a chat log and no piecing the story together message by message.

The layout is built for speed of understanding rather than completeness of text. Blockers are pulled out and made visually obvious, so a lead's eye is drawn straight to the people who need help. People with no update yet are marked. People cruising along look calm and unremarkable, which is exactly right — the lead's attention should go where the friction is.

At the very top of this screen sits a short, plain-English summary of the day written by the AI assistant, which the next section covers. So before the lead even reads a single individual update, they already have the gist: how many people checked in, who's blocked, and what looks risky.

---

## Reading updates across time zones on the dashboard

Here's where the personal-clock idea pays off for the lead.

Because teammates can be on different calendar days at the same moment, the dashboard's default view is simply **the latest update from each person**, each one clearly labelled with the writer's own day and the moment they sent it. So the lead might see one teammate's card sitting on Tuesday right next to another still on Monday, and nothing looks broken or missing. Each person is shown on their own terms, and the labels make it obvious why the dates differ.

If the lead wants to look at a specific day rather than "the freshest of everything," there's a date picker. When they choose a day, the app lines everyone up by *their* version of that day — so "show me Monday" pulls each person's update for the Monday they personally lived, not a single rigid window that would clip half the team. The result is that a lead never has to do time zone arithmetic in their head. The app has already sorted it out and just shows the right updates under the right day, with honest labels.

---

## The AI assistant: making sense of the day

The AI helper is the lead's shortcut from "a screen full of updates" to "here's what actually matters." Crucially, it only ever talks about what people genuinely wrote — real names, real tasks, real blockers. It doesn't invent progress or pad things out with generic filler. If there's little data, it says so plainly rather than making something up.

When a lead asks it to make sense of the day, it does a handful of concrete things:

**It summarises the standup in a few sentences.** Something like: most of the team checked in, a couple of people are heads-down on the same feature, and two folks flagged blockers. It's the elevator-pitch version of the whole board.

**It points out who seems blocked.** Anyone who wrote a real blocker gets surfaced by name, and if someone's been carrying the *same* blocker for several days running, the assistant calls that out as more urgent than a fresh one — a blocker that won't die is a bigger deal than a blocker that just appeared.

**It notices repeated tasks.** If a person has written "still working on the login page" three days in a row, the assistant flags that the task keeps reappearing. Repetition usually means someone's quietly stuck, even if they never used the word "blocked."

**It highlights risks.** If several people are waiting on the same thing, or a task that was supposed to take a day has stretched across the week, it names that as a risk worth a look — the kind of pattern that's invisible when you read updates one at a time but obvious when something reads them all together.

**It suggests follow-ups.** It ends with a short, practical nudge list: who the lead might want to check in with, and why. Not orders — just a sensible starting point for the lead's day.

The whole point is that the assistant works *from the standups*. Every observation it makes can be traced back to something a real person actually typed, which is what makes it trustworthy rather than decorative.

---

## Looking back: history and tracking

Beyond today, both members and leads can look backward. A member can browse their own past updates to remember what they've been doing and to notice their own patterns. A lead can pull up any past day for the whole team and read exactly what was happening then, laid out the same clean way as today's board.

This is what solves the original pain of updates getting buried. Nothing gets lost, nothing gets scrolled past, and "what did we say we'd do last week?" has a real answer instead of a shrug. Because every update is tied to the writer's own day, the history stays honest across time zones too — looking back at "last Monday" shows each person's actual Monday.

---

## Nudges and alerts: notifications

The app gives a couple of gentle pushes so it stays useful without becoming annoying.

Members get a friendly **reminder** near the start of their own working day if they haven't posted yet — timed to *their* day, which the app already knows, so nobody's phone buzzes at 3 in the morning. It's a nudge, not a nag, and it goes away the moment they submit.

Leads and admins can get a heads-up when something worth their attention appears — for example, when a new blocker is posted, or when several people are stuck. The idea is that a lead shouldn't have to sit refreshing the dashboard all day; the app taps them on the shoulder when there's genuinely something to look at, and otherwise stays quiet.

---

## Running the team: admin controls

This is the admin's home base, and it's more central now, because it's where the team actually takes shape. From here the admin can:

**Add members.** The admin types in a new person's name and email, and the app invites them to set a password and join. This is the only way members come into existence, which keeps the roster deliberate and tidy.

**Set and change roles.** The admin decides who is a plain member and who is a lead with the full team view, and can change that at any time as responsibilities shift.

**Remove people.** When someone leaves the team, the admin removes their access. Their past updates stay in the team's history, but they can't sign in anymore.

These controls are kept clear and purposeful. They exist to keep the roster accurate and the roles correct — everyday standup life happens on the member and lead screens, and admin is the room you visit when the team itself changes.

---

## Behind the scenes, in plain terms

Everything above is what you *see*. This last part explains, without any jargon, how the app behaves under the hood so that the experience stays smooth.

### Every team kept separate

Because many different companies and teams use the same app, keeping them apart is the first rule. Each team lives in its own private space. One team's members, updates, and history are completely invisible to every other team — there's no way to peek across the wall, on purpose or by accident. When you sign in, the app knows exactly which team you belong to and only ever shows you your team's world. So two rival companies could both be using the tool at the same time and neither would ever catch a glimpse of the other.

### Many people using it at the same time

Mornings are busy — a whole team may be submitting within the same hour. The app handles each person's update as its own separate little action, so two people posting at the same instant never trip over each other. Your update is yours; it's filed under your name and your day, and someone else hitting submit at the same moment has no effect on it. Even if a lead is reading the dashboard at the exact second three people post, they simply see the new updates appear — nobody has to wait in line, and nothing gets mixed up between people.

### Keeping information private and safe

Only signed-in people can see anything at all, and what they can see depends on who they are and which team they're on. A member sees their own updates; a lead or admin sees their team; nobody sees another team. Passwords are never stored in a way that anyone — including the people running the app — could read them back. Information travels between your device and the app in a scrambled form that outsiders can't eavesdrop on. And the app double-checks *on every single request* that you are who you say you are, that you're on the team you claim, and that you're allowed to see what you asked for, rather than trusting that because you got in once, you can wander anywhere.

### Staying fast and responsive

The screens people use most — your home page, the lead's dashboard — are built to appear quickly and feel instant when you tap around. When you submit an update, the app confirms it right away rather than leaving you staring at a spinner wondering if it worked. Heavier work, like the AI reading the whole team's updates and thinking about them, is done in a way that doesn't freeze the rest of the screen; you can keep reading updates while the summary is being prepared, and it slots in when it's ready. The app also avoids re-doing work it's already done, so common views feel snappy even when lots of people are online.

### When something goes wrong

Things occasionally go sideways — a shaky connection, a hiccup somewhere in the system — and the app is built to fail gently rather than dramatically. If your update can't be sent for a moment, the app tells you plainly and lets you try again, without silently swallowing what you wrote. If the AI assistant is having a slow moment, the dashboard still shows every real update as normal; you just see a small "summary unavailable right now" note instead of the summary, and it comes back on its own. Your submitted updates are kept safely and aren't lost because one part of the app stumbled. The guiding rule is that a problem in one corner never takes down the whole experience — worst case, you see a clear, honest message and a way forward, not a blank screen or a lost update.

---

## The short version

Someone starts a team by signing up, which makes them its admin and gives the team its own private space. From the dashboard, the admin creates accounts for everyone else and decides who's a plain member and who's a lead. Each day, a member opens the app, signs in, and answers three small questions about yesterday, today, and anything in their way — and the app quietly records it against their own day, without ever asking them about location or time. A lead or admin opens the app and sees the entire team on one screen, with blockers highlighted, gaps marked, dates handled correctly no matter where people are, and a plain-English AI summary at the top telling them where to look first. Nothing gets buried, everyone's "today" is genuinely theirs, teams never see each other's data, and the lead understands the team's day in the time it takes to read a paragraph. That's the whole product.
