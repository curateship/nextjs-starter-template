/**
 * The bundled names, places and work the made-up members are made from (live
 * activity task 01, Part 8). See `workspace/docs/made-up-members.md`.
 *
 * Each place has its own timezone, its own first names and surnames, and a few
 * side projects that belong there, so a name, a bio and a project list read as
 * one person from one city. The work (what somebody does all day, their
 * projects and the titles of their tasks) is shared between places.
 *
 * `{city}` in a bio and `{colleague}` in a task title are filled in when the
 * account is made, the colleague from the same city's first names.
 */

export type SimulatedPlace = {
  city: string
  timezone: string
  firstNames: readonly string[]
  lastNames: readonly string[]
  /** Side projects that only make sense in this place. */
  localProjects: readonly string[]
}

type SimulatedWork = {
  /** Three ways to open a bio, each naming the city. */
  bios: readonly string[]
  projects: readonly string[]
  tasks: readonly string[]
}

export const SIMULATED_PLACES: readonly SimulatedPlace[] = [
  {
    city: "Lisbon",
    timezone: "Europe/Lisbon",
    firstNames: ["Ana", "Inês", "Beatriz", "Mariana", "Tiago", "João", "Rui", "Duarte", "Catarina", "Miguel"],
    lastNames: ["Silva", "Santos", "Ferreira", "Costa", "Oliveira", "Martins", "Rodrigues", "Sousa", "Pereira", "Almeida"],
    localProjects: ["Surf trip plan", "Alfama photo zine", "Portuguese recipes blog"],
  },
  {
    city: "London",
    timezone: "Europe/London",
    firstNames: ["Amelia", "Oliver", "Freya", "Harry", "Isabelle", "George", "Poppy", "Alfie", "Imogen", "Samir"],
    lastNames: ["Clarke", "Hughes", "Patel", "Evans", "Ahmed", "Turner", "Bennett", "Khan", "Wright", "Cooper"],
    localProjects: ["Allotment planner", "Half marathon training", "Flat move"],
  },
  {
    city: "Berlin",
    timezone: "Europe/Berlin",
    firstNames: ["Lena", "Jonas", "Mia", "Felix", "Hannah", "Lukas", "Clara", "Paul", "Sophie", "Moritz"],
    lastNames: ["Müller", "Schmidt", "Wagner", "Becker", "Hoffmann", "Schulz", "Koch", "Richter", "Wolf", "Neumann"],
    localProjects: ["German C1", "Kiez newsletter", "Synth patches"],
  },
  {
    city: "Lagos",
    timezone: "Africa/Lagos",
    firstNames: ["Chiamaka", "Tunde", "Ngozi", "Emeka", "Funmi", "Kelechi", "Aisha", "Segun", "Ifeoma", "Dayo"],
    lastNames: ["Okafor", "Adeyemi", "Okonkwo", "Balogun", "Eze", "Adebayo", "Nwosu", "Ogunleye", "Bello", "Uche"],
    localProjects: ["Afrobeats playlist site", "Lekki market stall", "Yoruba lessons"],
  },
  {
    city: "Nairobi",
    timezone: "Africa/Nairobi",
    firstNames: ["Wanjiru", "Kamau", "Achieng", "Otieno", "Njeri", "Mwangi", "Akinyi", "Kiprop", "Zawadi", "Baraka"],
    lastNames: ["Odhiambo", "Kariuki", "Wambui", "Omondi", "Kiplagat", "Njoroge", "Muthoni", "Ochieng", "Kimani", "Wekesa"],
    localProjects: ["M-Pesa side shop", "Ngong hills hike", "Swahili poetry"],
  },
  {
    city: "Istanbul",
    timezone: "Europe/Istanbul",
    firstNames: ["Elif", "Mehmet", "Zeynep", "Can", "Ayşe", "Emre", "Defne", "Burak", "Selin", "Kerem"],
    lastNames: ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Aydın", "Öztürk", "Arslan", "Doğan", "Koç"],
    localProjects: ["Bosphorus sketchbook", "Ceramics course", "Kadıköy café guide"],
  },
  {
    city: "Mumbai",
    timezone: "Asia/Kolkata",
    firstNames: ["Priya", "Arjun", "Ananya", "Rohan", "Kavya", "Vikram", "Isha", "Aditya", "Neha", "Siddharth"],
    lastNames: ["Sharma", "Patel", "Iyer", "Mehta", "Desai", "Kulkarni", "Rao", "Joshi", "Nair", "Shah"],
    localProjects: ["GRE prep", "Marathi short films", "Cricket club accounts"],
  },
  {
    city: "Jakarta",
    timezone: "Asia/Jakarta",
    firstNames: ["Putri", "Budi", "Ayu", "Rizky", "Dewi", "Andi", "Sari", "Fajar", "Intan", "Dimas"],
    lastNames: ["Santoso", "Wijaya", "Hidayat", "Saputra", "Kusuma", "Pratama", "Lestari", "Nugroho", "Halim", "Gunawan"],
    localProjects: ["Batik shop website", "IELTS prep", "Warung menu photos"],
  },
  {
    city: "Manila",
    timezone: "Asia/Manila",
    firstNames: ["Bea", "Paolo", "Camille", "Miguel", "Patricia", "Carlo", "Kristine", "Rafael", "Jasmine", "Mark"],
    lastNames: ["Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Mendoza", "Villanueva", "Ramos", "Aquino", "Dela Cruz"],
    localProjects: ["Board exam review", "Food truck plan", "Tagalog podcast"],
  },
  {
    city: "Seoul",
    timezone: "Asia/Seoul",
    firstNames: ["Ji-woo", "Min-jun", "Seo-yeon", "Do-yun", "Ha-eun", "Ji-ho", "Su-bin", "Hyun-woo", "Ye-jin", "Jun-seo"],
    lastNames: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim"],
    localProjects: ["TOEIC practice", "Webtoon storyboards", "Hangang running log"],
  },
  {
    city: "Tokyo",
    timezone: "Asia/Tokyo",
    firstNames: ["Yui", "Haruto", "Sakura", "Ren", "Aoi", "Sota", "Hina", "Kenji", "Mei", "Daiki"],
    lastNames: ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato"],
    localProjects: ["English conversation", "Kissaten photo book", "Shogi openings"],
  },
  {
    city: "Sydney",
    timezone: "Australia/Sydney",
    firstNames: ["Chloe", "Jack", "Olivia", "Liam", "Isla", "Noah", "Ruby", "Cooper", "Zoe", "Lachlan"],
    lastNames: ["Smith", "Jones", "Williams", "Brown", "Wilson", "Taylor", "Nguyen", "Kelly", "Ryan", "Walsh"],
    localProjects: ["Coastal walk guide", "Surf club newsletter", "Renovation budget"],
  },
  {
    city: "Auckland",
    timezone: "Pacific/Auckland",
    firstNames: ["Aroha", "Mason", "Ella", "Nikau", "Amelia", "Tama", "Grace", "Finn", "Mere", "Hunter"],
    lastNames: ["Ngata", "Thompson", "Walker", "Parata", "Clarke", "Tane", "Morgan", "Harris", "Reid", "Wilson"],
    localProjects: ["Te reo Māori lessons", "Sailing course", "Waiheke trip"],
  },
  {
    city: "São Paulo",
    timezone: "America/Sao_Paulo",
    firstNames: ["Gabriela", "Lucas", "Juliana", "Rafael", "Camila", "Thiago", "Larissa", "Bruno", "Fernanda", "Matheus"],
    lastNames: ["Souza", "Lima", "Carvalho", "Gomes", "Ribeiro", "Barbosa", "Araújo", "Rocha", "Dias", "Moreira"],
    localProjects: ["Concurso study plan", "Samba school costumes", "English for work"],
  },
  {
    city: "Mexico City",
    timezone: "America/Mexico_City",
    firstNames: ["Valeria", "Diego", "Ximena", "Santiago", "Regina", "Emiliano", "Daniela", "Alejandro", "Renata", "Mateo"],
    lastNames: ["Hernández", "García", "Martínez", "López", "González", "Ramírez", "Flores", "Cruz", "Morales", "Reyes"],
    localProjects: ["Mezcal tasting notes", "Coyoacán mural photos", "TOEFL prep"],
  },
  {
    city: "Toronto",
    timezone: "America/Toronto",
    firstNames: ["Emma", "Ethan", "Maya", "Owen", "Priyanka", "Daniel", "Leah", "Marcus", "Sarah", "Kevin"],
    lastNames: ["Tremblay", "Chen", "MacDonald", "Singh", "Campbell", "Wong", "Gagnon", "Roy", "Lee", "Fraser"],
    localProjects: ["French for the exam", "Condo board minutes", "Hockey league stats"],
  },
  {
    city: "New York",
    timezone: "America/New_York",
    firstNames: ["Madison", "Tyrese", "Rachel", "Jordan", "Gabriel", "Alyssa", "Brandon", "Nicole", "Malik", "Hannah"],
    lastNames: ["Johnson", "Rosen", "Cohen", "Rivera", "Kim", "Brooks", "Murphy", "Greenberg", "Torres", "Washington"],
    localProjects: ["Apartment hunt", "Bodega photo series", "Spanish class"],
  },
  {
    city: "Denver",
    timezone: "America/Denver",
    firstNames: ["Austin", "Brooke", "Logan", "Megan", "Caleb", "Jenna", "Wyatt", "Paige", "Cody", "Sierra"],
    lastNames: ["Anderson", "Miller", "Thompson", "Martinez", "Clark", "Lewis", "Young", "Hall", "Allen", "Wright"],
    localProjects: ["Fourteeners list", "Ski season budget", "Home brewing log"],
  },
  {
    city: "Los Angeles",
    timezone: "America/Los_Angeles",
    firstNames: ["Sofia", "Nathan", "Jasmine", "Adrian", "Vanessa", "Eric", "Natalie", "Kai", "Andrea", "Jason"],
    lastNames: ["Nguyen", "Park", "Gutierrez", "Lopez", "Tran", "Kim", "Ruiz", "Castillo", "Choi", "Mendoza"],
    localProjects: ["Screenplay draft", "Taco map", "Audition tapes"],
  },
]

export const SIMULATED_WORK: readonly SimulatedWork[] = [
  {
    bios: [
      "Backend developer in {city}.",
      "Writing code for a small fintech in {city}.",
      "Frontend dev, {city}. Mostly React, mostly fine.",
    ],
    projects: ["Checkout rewrite", "API v2", "Mobile app", "Side project"],
    tasks: ["Fix the login bug", "Review {colleague}'s pull request", "Write tests for checkout", "Refactor the settings page", "Sprint planning notes", "Update the deploy script", "Read up on caching", "Clear the bug backlog"],
  },
  {
    bios: [
      "PhD student in {city}, writing about urban heat.",
      "Fourth-year PhD in {city}. The thesis is nearly a thesis.",
      "Doing a PhD in linguistics in {city}.",
    ],
    projects: ["Thesis", "Conference paper", "Teaching", "Literature review"],
    tasks: ["Chapter 4 edits", "Read two papers", "Clean the survey data", "Reply to {colleague}'s notes", "Draft the methods section", "Fix the citations", "Prepare the seminar slides", "Run the regression again"],
  },
  {
    bios: [
      "Product designer in {city}.",
      "Freelance designer working from {city}.",
      "Brand and web design, based in {city}.",
    ],
    projects: ["Brand refresh", "Website redesign", "Portfolio", "Client: bakery"],
    tasks: ["Logo sketches", "Moodboard for {colleague}", "Homepage wireframe", "Export the icon set", "Feedback round two", "Type pairing tests", "Update the portfolio", "Mobile mockups"],
  },
  {
    bios: [
      "Writing my first novel in {city}.",
      "Freelance writer in {city}. Words for money, words for me.",
      "Journalist turned novelist, {city}.",
    ],
    projects: ["Novel draft", "Short stories", "Newsletter", "Freelance pieces"],
    tasks: ["Write 1,000 words", "Edit chapter 7", "Outline the next scene", "Pitch to {colleague}", "Newsletter draft", "Research for chapter 9", "Read-through of part one", "Fix the timeline"],
  },
  {
    bios: [
      "Marketing lead at a startup in {city}.",
      "Content and campaigns, {city}.",
      "Growth marketer in {city}.",
    ],
    projects: ["Q4 campaign", "Q3 report", "Website copy", "Launch plan"],
    tasks: ["Draft the Q3 deck", "Reply to {colleague}'s notes", "Campaign brief", "Email sequence", "Budget sheet", "Landing page copy", "Weekly report", "Plan the launch posts"],
  },
  {
    bios: [
      "Med student in {city}.",
      "Third-year medicine, {city}. Flashcards forever.",
      "Studying medicine in {city}.",
    ],
    projects: ["Anatomy", "Pharmacology", "Exam prep", "Clinical notes"],
    tasks: ["Flashcards: cardiology", "Past paper questions", "Review lecture 12", "Case study write-up", "Pharmacology chapter 5", "Quiz with {colleague}", "Summarise the renal notes", "Practise exam stations"],
  },
  {
    bios: [
      "Accountant in {city}, studying for the next exam.",
      "Bookkeeping for small businesses around {city}.",
      "Audit by day, {city}.",
    ],
    projects: ["Year-end close", "Tax returns", "Accounting exam", "Client: café"],
    tasks: ["Reconcile March", "Expense report", "VAT return", "Client invoices", "Payroll check", "Budget variance notes", "Exam practice questions", "Reply to {colleague} about the audit"],
  },
  {
    bios: [
      "Data analyst in {city}.",
      "Numbers person at a logistics company in {city}.",
      "Analytics in {city}. SQL is my love language.",
    ],
    projects: ["Churn model", "Sales dashboard", "SQL practice", "Quarterly review"],
    tasks: ["Clean the sales data", "Build the retention chart", "Write up findings for {colleague}", "Fix the broken query", "Dashboard filters", "A/B test readout", "Document the pipeline", "Check the forecast"],
  },
  {
    bios: [
      "Architect in {city}.",
      "Junior architect in {city}, studying for my licence.",
      "Designing small houses in {city}.",
    ],
    projects: ["Library competition", "Kitchen extension", "Portfolio", "Licence exam"],
    tasks: ["Section drawings", "Site photos for {colleague}", "Model the stair", "Planning statement", "Material schedule", "Render the courtyard", "Study the building code", "Client meeting notes"],
  },
  {
    bios: [
      "Composer and music teacher in {city}.",
      "Making an album in a small flat in {city}.",
      "Session musician, {city}.",
    ],
    projects: ["Album", "Film score", "Practice", "Teaching"],
    tasks: ["Mix track 4", "Scales and arpeggios", "Arrange the strings", "Lyrics for verse two", "Send stems to {colleague}", "Transcribe the solo", "Practise the set", "Edit the demo"],
  },
  {
    bios: [
      "Building a small startup in {city}.",
      "Founder, {city}. Two of us and a lot of tabs.",
      "Running a tiny SaaS from {city}.",
    ],
    projects: ["MVP", "Fundraising", "Hiring", "Customer calls"],
    tasks: ["Investor update", "Pitch deck v3", "Interview notes", "Pricing page", "Reply to {colleague}", "Onboarding emails", "Roadmap for Q4", "Bug triage"],
  },
  {
    bios: [
      "Law student in {city}.",
      "Trainee lawyer in {city}.",
      "Studying for the bar in {city}.",
    ],
    projects: ["Bar exam", "Contract review", "Moot court", "Client memo"],
    tasks: ["Case notes: contracts", "Practice essay", "Read the judgment", "Draft the memo for {colleague}", "Moot court arguments", "Outline torts", "Timed questions", "Check the citations"],
  },
  {
    bios: [
      "Secondary school teacher in {city}.",
      "Teaching maths in {city}.",
      "History teacher, {city}.",
    ],
    projects: ["Lesson plans", "Marking", "Reports", "Course redesign"],
    tasks: ["Mark year 10 essays", "Plan Monday's lesson", "Write the end-of-term reports", "Worksheet on fractions", "Reply to {colleague} about the trip", "Mock exam paper", "Update the slides", "Parent emails"],
  },
  {
    bios: [
      "Translator in {city}.",
      "Freelance translator, English and two others, {city}.",
      "Subtitles and books, translated in {city}.",
    ],
    projects: ["Book translation", "Agency jobs", "Glossary", "Invoices"],
    tasks: ["Translate 2,000 words", "Proofread chapter 3", "Subtitle episode 6", "Glossary for {colleague}", "Send the invoices", "Terminology research", "Revise the contract", "Quote for the new client"],
  },
  {
    bios: [
      "Biologist in a lab in {city}.",
      "Postdoc in {city}, mostly pipettes.",
      "Researcher in {city}, writing grants between experiments.",
    ],
    projects: ["Grant application", "Paper revisions", "Lab protocols", "Data analysis"],
    tasks: ["Reply to reviewer 2", "Analyse the qPCR results", "Grant budget", "Update the protocol", "Figures for {colleague}", "Read the new preprint", "Write the discussion", "Order supplies"],
  },
]

/** Second sentences for a bio, about how the person works. */
export const SIMULATED_BIO_TAILS: readonly string[] = [
  "Mornings are for deep work, afternoons for email.",
  "Two long blocks before lunch, then whatever is left.",
  "Coffee, headphones, timer. In that order.",
  "Trying to do fewer things better.",
  "Here for the streak, staying for the quiet.",
  "Rain sounds and a 40 minute timer.",
  "Slowly getting better at not checking my phone.",
  "If I'm online, I'm probably avoiding something harder.",
  "Small steps, most days.",
  "Lo-fi and long sessions.",
  "Learning to take the breaks too.",
  "Working from the kitchen table again.",
]

/**
 * How somebody comes across, kept on the account for the room chat in task
 * 03. Nothing in task 01 reads it.
 */
export const SIMULATED_PERSONALITIES: readonly string[] = [
  "Warm and chatty, cheers other people on.",
  "Dry humour, short sentences, rarely uses emoji.",
  "Earnest and curious, asks what others are working on.",
  "Quiet, says hello and gets on with it.",
  "Upbeat, a little scattered, lots of exclamation marks.",
  "Calm and steady, talks about routines.",
  "Self-deprecating about procrastinating.",
  "Practical, shares small tips that worked for them.",
  "Friendly but brief, mostly reacts rather than writes.",
  "Nerdy about tools and timers.",
  "Encouraging, the first to say well done.",
  "Tired but determined, jokes about coffee.",
]

/**
 * A name as a handle: lower case, accents and spaces gone. "Ayşe Yılmaz"
 * becomes "ayseyilmaz".
 */
export function handleWord(value: string) {
  return value
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}
