# Importing the contact list from systemeverything.com

systemeverything.com is one website on the old multi-site platform in
`apps/hub`, and its contact list is the one this app starts from.
`scripts/import-systemeverything-contacts.mjs` copies it across. It is a one-off,
not a feature: there is no import screen in the app, because there is one list to
move and nobody will ever ask for a second.

## What it carries

The address, the name where there is one, when they joined, where they came
from, their tags, and their status.

Statuses map straight across, with `active` renamed: active becomes On the list,
and cold, unsubscribed, bouncing and spam-complained keep their own meaning.
Nothing is guessed. A status the old site grows later stops the script with a
count, rather than quietly leaving those people out.

## What it leaves behind, and why that costs nothing

- **The Notion marketplace purchase fields.** 3,820 contacts carry fifteen of
  them. Every single one paid zero and used no coupon, because the templates were
  free, and 3,817 already carry the template's name as a tag. So the only facts
  not already here are the date they took it and their locale.
- **The per-email open history.** What it was feeding on the old site was the
  cold status, and the status itself comes across. A quiet contact who opens
  anything here is put straight back on the list, so nothing has to be rebuilt
  for them.
- **The date somebody opted out.** The old table never recorded one.

## The tags were broken, and the import fixes them

The old site stores a contact's tags as a list, and 432 of its 578 tags are
several tags jammed into one entry with commas, like
`Imported February 1st, 2025 at 7:28 AM (Gumroad),Cold Subscribers`. 1,686
people are affected.

Splitting on the comma fixes most of it and breaks the rest, because the
`Imported <date>` tags contain a comma of their own — which is how the old site
ended up with tags named `Imported April 13th` and `2025 at 8:08 AM (Beehiiv)`
and a segment rule listing both. So the script splits on commas and then joins an
unfinished `Imported <month> <day>` back onto the year that follows it.

578 tags become 158.

## Running it twice is safe, and it does not undo anybody's choices

A contact who is already in this app keeps their status and gains any tags they
were missing. Only a new contact takes a status from the old site.

That is deliberate. Somebody who unsubscribed here after the first run would
otherwise be put back on the list by the second. It also means one thing to know:
Tyler's own address is unsubscribed on systemeverything.com and was already a
contact here as On the list, so it stayed On the list. It is the only address the
two sites disagree about.

## Running it

The old platform's database address is in `apps/hub/.env` in the main checkout.
The script only ever reads from it, so nothing can be damaged on the live site.

```
SOURCE_DATABASE_URL=<the old platform's database> \
CUSTOM_SHELL_DATABASE_URL=<this app's database> \
node scripts/import-systemeverything-contacts.mjs --workspace <workspace id>
```

`--dry-run` reads everything, prints what it would write, and writes nothing.
Run that first. `--domain <host>` picks a different website on the old platform.

**The workspace must be named.** The script never creates one, and it refuses to
guess when the app has more than one, printing the list with its ids. Getting
this wrong is the easy mistake: the workspace an admin sees is the one their
account points at, which is not necessarily the oldest or the one called "My
project".

## What arrived, 4 Oct 2026

25,100 contacts into the "System Everything" workspace: 15,059 on the list,
9,405 gone quiet, 370 bouncing, 258 opted out, 8 marked it spam. 158 tags. One
address already here, so 25,099 added.

Where they came from: 21,214 an older import, 3,780 the Notion marketplace, 70
added by hand, and a handful from lead magnets and forms.
