/**
 * The CRM's sample leads, and the one function that writes them.
 *
 * Its own file so it can be tested: `scripts/crm-samples.test.mjs` runs it
 * against a throwaway database and checks the rows it writes. Left inside
 * `setup-database.mjs` the only way to find out whether the SQL was right was
 * to run `db:setup` on a real machine and read the error.
 *
 * `client` is anything with a `query(sql, params)` that answers `{ rows }`,
 * which is both `pg.Client` and PGlite. `adminEmail` is the account
 * `setup-database.mjs` creates, and it decides which workspace the samples are
 * filed under.
 */

/**
 * The sample leads and their mail, so the CRM screen has something in it.
 *
 * An empty inbox cannot be judged: the panels, the stages, the unread weight,
 * the follow-up dates and the bubbles all need rows before anybody can say
 * whether they look right. Between them these eight cover every state the
 * screen can be in — each stage, unread, snoozed, closed, an overdue chase, an
 * attachment, a long thread that crosses days, and one message whose body
 * never arrived.
 *
 * Times are in minutes, not days, so the inbox shows its short forms: "2m",
 * "18m", "3h", "Yesterday", "Mon", "Sep 28".
 */
export const CRM_SAMPLE_LEADS = [
  {
    id: "sample-lead-1",
    email: "jane@fieldandoak.com",
    name: "Jane Okafor",
    company: "Field & Oak",
    phone: "+1 415 555 0132",
    stage: "quoted",
    valueCents: 480000,
    followUpMinutes: null,
    followUpNote: null,
    subject: "Kitchen for the new shop",
    status: "open",
    read: true,
    messages: [
      {
        direction: "in",
        minutes: 8640,
        body: "Hi there,\n\nWe are fitting out a second shop on Valencia Street and need the kitchen done by the end of May. Roughly 40 square metres. Could you put a number on it?\n\nThanks,\nJane",
      },
      {
        direction: "out",
        minutes: 7200,
        body: "Hi Jane,\n\nThanks for getting in touch. For 40 square metres with a commercial extract we would be around $4,800 all in, and we could start the second week of April.\n\nHappy to walk the site if that helps.",
      },
      {
        direction: "in",
        minutes: 2880,
        body: "That works. Let me take it to my business partner this week and come back to you.",
      },
    ],
  },
  {
    id: "sample-lead-2",
    email: "d.marsh@northgatelets.co.uk",
    name: "Daniel Marsh",
    company: "Northgate Lets",
    phone: null,
    stage: "new",
    valueCents: 0,
    followUpMinutes: null,
    followUpNote: null,
    subject: "Do you do flats?",
    status: "open",
    read: false,
    messages: [
      {
        direction: "in",
        minutes: 18,
        body: "Morning,\n\nWe manage about sixty flats and the kitchens are all the same small layout. Is that something you would take on, or are you commercial only?\n\nDaniel",
      },
    ],
  },
  {
    id: "sample-lead-3",
    email: "hello@brightwellcafe.com",
    name: "Priya Brightwell",
    company: "Brightwell Cafe",
    phone: "+44 7700 900412",
    stage: "contacted",
    valueCents: 125000,
    // Already passed, so the bell gets a notice and the row says "To follow up".
    followUpMinutes: 4320,
    followUpNote: "Ask whether the landlord signed off the extract.",
    subject: "Extract fan replacement",
    status: "open",
    read: true,
    messages: [
      {
        direction: "in",
        minutes: 20160,
        body: "Our extract fan has started making a noise and the landlord wants it replaced rather than repaired. What would that cost?",
      },
      {
        direction: "out",
        minutes: 18720,
        body: "Hi Priya,\n\nA like-for-like replacement is $1,250 fitted, including taking the old one away. The landlord will need to sign off the roof work.\n\nLet me know and I will book it in.",
      },
    ],
  },
  {
    id: "sample-lead-4",
    email: "marcus@haleandsons.com",
    name: "Marcus Hale",
    company: "Hale & Sons Bakery",
    phone: "+1 212 555 0188",
    stage: "won",
    valueCents: 960000,
    followUpMinutes: null,
    followUpNote: null,
    subject: "Two ovens and a proving room",
    status: "open",
    read: true,
    // Five messages across four days, which is what puts the date separators
    // between the bubbles.
    messages: [
      {
        direction: "in",
        minutes: 7200,
        body: "We are moving to the unit next door and taking the chance to replace both deck ovens. There is also a proving room to build out, about 12 square metres.\n\nAre you free to look at it?",
      },
      {
        direction: "out",
        minutes: 6900,
        body: "Yes. I could come Thursday morning, or Friday any time after 10.",
      },
      { direction: "in", minutes: 6840, body: "Thursday at 9 suits us." },
      {
        direction: "out",
        minutes: 2880,
        body: "Good to meet you both. The quote is $9,600 for the two ovens fitted and the proving room built and insulated, four weeks from a deposit.",
      },
      {
        direction: "in",
        minutes: 1440,
        body: "Deposit went over this morning. Looking forward to it.",
      },
    ],
  },
  {
    id: "sample-lead-5",
    email: "aisha@thecopperpot.co",
    name: "Aisha Rahman",
    company: "The Copper Pot",
    phone: null,
    stage: "lost",
    valueCents: 240000,
    followUpMinutes: null,
    followUpNote: null,
    subject: "Refit quote",
    // Closed, so it is out of the inbox until the filter is changed.
    status: "closed",
    read: true,
    messages: [
      {
        direction: "in",
        minutes: 43200,
        body: "Could you quote for a full refit of a 25 square metre kitchen? We are getting three prices.",
      },
      {
        direction: "out",
        minutes: 41760,
        body: "Of course. For 25 square metres, stripped and refitted, we would be $2,400 including the extract clean.",
      },
      {
        direction: "in",
        minutes: 37440,
        body: "Thanks for taking the time. We have gone with a local firm this time, mostly on timing. Will keep you in mind.",
      },
    ],
  },
  {
    id: "sample-lead-6",
    email: "tom.beckett@beckettcatering.com",
    name: "Tom Beckett",
    company: "Beckett Catering",
    phone: "+44 7700 900155",
    stage: "new",
    valueCents: 0,
    followUpMinutes: null,
    followUpNote: null,
    subject: "Plans attached",
    status: "open",
    read: false,
    messages: [
      {
        direction: "in",
        minutes: 180,
        body: "Drawings for the new unit are attached. The gas run is the part I am least sure about.",
        attachments: [
          {
            id: "sample-att-1",
            filename: "ground-floor-plan.pdf",
            contentType: "application/pdf",
            size: null,
          },
          {
            id: "sample-att-2",
            filename: "gas-run-photo.jpg",
            contentType: "image/jpeg",
            size: null,
          },
        ],
      },
      {
        direction: "in",
        minutes: 2,
        // No body on purpose: this is what a message looks like while its
        // second request is still in flight, and it is worth seeing once.
        body: null,
      },
    ],
  },
  {
    id: "sample-lead-7",
    email: "lena@vasquezwine.com",
    name: "Lena Vasquez",
    company: "Vasquez Wine Bar",
    phone: null,
    stage: "contacted",
    valueCents: 320000,
    // Still to come, so the row stays quiet until the date arrives.
    followUpMinutes: -10080,
    followUpNote: "She is back from holiday on the 12th.",
    subject: "Back bar and glasswasher",
    // Snoozed until next week, so it is out of the inbox and comes back on its
    // own when the background pass notices the date.
    status: "snoozed",
    snoozeMinutes: -10080,
    read: true,
    messages: [
      {
        direction: "in",
        minutes: 14400,
        body: "We want the back bar rebuilt with a proper glasswasher under it. No rush, we are closed for refurbishment until the spring.",
      },
      {
        direction: "out",
        minutes: 14040,
        body: "Noted. I will put something together closer to the time so the prices are current rather than three months old.",
      },
    ],
  },
  {
    id: "sample-lead-8",
    email: "r.moreno@morenohotels.com",
    name: "Rita Moreno",
    company: "Moreno Hotels",
    phone: "+1 305 555 0117",
    stage: "quoted",
    valueCents: 1850000,
    followUpMinutes: null,
    followUpNote: null,
    subject: "Four sites, one spec",
    status: "open",
    read: true,
    messages: [
      {
        direction: "in",
        minutes: 100800,
        body: "We have four properties and want the same kitchen spec in all of them, rolled out over the year. Is that something you can handle?",
      },
      {
        direction: "out",
        // Ours is the newest, so this row reads "You: ..." in the inbox.
        minutes: 99360,
        body: "We can. Doing all four to one spec takes about $18,500 off the total against quoting them separately, and it means one set of spares.\n\nThe full breakdown is in the attached note.",
      },
    ],
  },
]

/**
 * Writes the sample leads, their conversations and a note, a to-do and a saved
 * reply to go with them.
 *
 * **Never touches an install that has real mail in it.** The moment a lead
 * exists that is not one of these samples, the whole thing is skipped, so a
 * deployment whose inbox is in use is never written to. Short of that, each
 * sample is topped up on its own, so adding one to the list below brings it to
 * a database that already has the others.
 *
 * Only ever runs from `db:setup`, which is the dev path. Production migrates
 * with `db:migrate` and never comes through here.
 */
/**
 * The workspace the samples belong in: **the one the person who signs in here
 * is actually looking at.**
 *
 * Three tries, and the order is the whole point:
 *
 * 1. The workspace `adminEmail` is in. That is the account `db:setup` creates
 *    and the one anybody signs in as locally, so it is the screen the samples
 *    have to appear on.
 * 2. Any other admin's current workspace, for a database seeded some other way.
 * 3. The oldest workspace, which is better than nothing.
 *
 * Getting this wrong is invisible rather than loud, and it happened twice. The
 * first version took the oldest workspace outright and filed eight leads under
 * a workspace made in July while the signed-in admin was in another one. The
 * second took the first admin by joining date, which on a database carrying
 * sample accounts is a fixture called Maya, not the person at the keyboard.
 * Both times the screen was correct and empty.
 */
async function sampleWorkspaceId(client, adminEmail) {
  if (adminEmail) {
    const theirs = await client.query(
      `select w.id
         from users u
         join workspaces w on w.id = u.current_workspace_id
        where lower(u.email) = lower($1)
        limit 1`,
      [adminEmail]
    )
    if (theirs.rows[0]?.id) return theirs.rows[0].id
  }

  const anyAdmin = await client.query(
    `select w.id
       from users u
       join workspaces w on w.id = u.current_workspace_id
      where u.role = 'admin'
      order by u.created_at asc
      limit 1`
  )
  if (anyAdmin.rows[0]?.id) return anyAdmin.rows[0].id

  const oldest = await client.query(
    "select id from workspaces order by created_at asc limit 1"
  )
  return oldest.rows[0]?.id ?? null
}

export async function seedCrmSamples(client, { adminEmail } = {}) {
  const sampleIds = CRM_SAMPLE_LEADS.map((lead) => lead.id)
  const real = await client.query(
    "select 1 from crm_leads where id <> all($1::text[]) limit 1",
    [sampleIds]
  )
  if (real.rows.length > 0) return

  const workspaceId = await sampleWorkspaceId(client, adminEmail)
  if (!workspaceId) return

  // Samples sitting in some other workspace are no use: the CRM reads the one
  // the admin is in, so a sample filed anywhere else is an empty inbox with
  // rows in the database. Taking them out is safe — these ids only ever belong
  // to this seed — and the loop below writes them again in the right place.
  await client.query(
    "delete from crm_leads where id = any($1::text[]) and workspace_id <> $2",
    [sampleIds, workspaceId]
  )

  const existing = await client.query(
    "select id from crm_leads where id = any($1::text[])",
    [sampleIds]
  )
  const already = new Set(existing.rows.map((row) => row.id))
  const owed = CRM_SAMPLE_LEADS.filter((lead) => !already.has(lead.id))
  if (owed.length === 0) return

  for (const lead of owed) {
    await client.query(
      `insert into crm_leads
         (id, workspace_id, email, name, company, phone, source, stage,
          value_cents, follow_up_at, follow_up_note, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'Email', $7, $8,
               case when $9::int is null then null
                    else now() - ($9::int || ' minutes')::interval end,
               $10, now(), now())`,
      [
        lead.id,
        workspaceId,
        lead.email,
        lead.name,
        lead.company,
        lead.phone,
        lead.stage,
        lead.valueCents,
        lead.followUpMinutes,
        lead.followUpNote,
      ]
    )

    const newest = lead.messages[lead.messages.length - 1]
    const threadId = `${lead.id}-thread`
    await client.query(
      `insert into crm_threads
         (id, workspace_id, lead_id, subject, subject_key, status,
          snoozed_until, last_message_at, last_direction, message_count,
          read_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6,
               case when $7::int is null then null
                    else now() - ($7::int || ' minutes')::interval end,
               now() - ($8::int || ' minutes')::interval, $9, $10,
               case when $11 then now() else null end, now(), now())`,
      [
        threadId,
        workspaceId,
        lead.id,
        lead.subject,
        lead.subject.toLowerCase(),
        lead.status,
        lead.snoozeMinutes ?? null,
        newest.minutes,
        newest.direction,
        lead.messages.length,
        lead.read,
      ]
    )

    for (const [index, message] of lead.messages.entries()) {
      await client.query(
        `insert into crm_messages
           (id, workspace_id, thread_id, direction, from_email, from_name,
            to_email, subject, text_body, rfc_message_id, provider_email_id,
            attachments, body_fetched_at, occurred_at, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 $12::jsonb,
                 case when $9::text is null then null else now() end,
                 now() - ($13::int || ' minutes')::interval,
                 now() - ($13::int || ' minutes')::interval)`,
        [
          `${threadId}-${index}`,
          workspaceId,
          threadId,
          message.direction,
          message.direction === "in" ? lead.email : "leads@example.com",
          message.direction === "in" ? lead.name : null,
          message.direction === "in" ? "leads@example.com" : lead.email,
          index === 0 ? lead.subject : `Re: ${lead.subject}`,
          message.body ?? null,
          `sample-${threadId}-${index}@example.com`,
          // Null, not a made-up Resend id: a sample must not look like a real
          // provider record somebody could go and look up.
          null,
          JSON.stringify(message.attachments ?? []),
          message.minutes,
        ]
      )
    }
  }
}
