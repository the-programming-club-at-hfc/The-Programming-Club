// Season content: weekly plan, game rules, scoring, and challenge decks.
// Plain data. Edit freely; the site and the TV screen read from here.
import type { Agenda, Award, Bug, Game, Idea, LangQ, OutputQ, Relay, Week, WikiRace, Xp } from "./types";

export const WEEKS: Week[] = [
  {
    kind: "kickoff",
    title: "Kickoff: Hello, World",
    pitch: "Meet the officers, find out how Season 0 works, tell us what you want from the club, then play the first Wiki Race.",
    games: ["Meet the officers", "Feedback wall", "Wiki Race (first match)"],
    bonus: "Everyone here tonight is a Founding Member and goes on the Season 0 roster.",
    showXp: 3,
  },
  {
    kind: "match",
    title: "Wiki Race Night",
    pitch: "Get from Pizza to the Moon using only Wikipedia links. Fastest team wins.",
    lesson:
      "Wikipedia is a graph (3 min): articles are nodes, links are edges, and the fastest route is a shortest-path problem. Hub pages like “United States” are the highways.",
    games: ["Tech Pictionary (warm-up)", "Wiki Race: Classic", "Wiki Race: Fewest Clicks", "Final round ×2: Wiki Race, CS edition"],
    showXp: 3,
  },
  {
    kind: "match",
    title: "Spooky Bugs",
    pitch: "Halloween Bug Hunt. Every snippet hides exactly one bug, and your team has 90 seconds to find it.",
    lesson: "How to read an error message (3 min): the last line tells you what went wrong, and the line number tells you where to look.",
    games: ["Output? (warm-up)", "Bug Hunt: easy & spooky", "Bug Hunt: medium", "Final round ×2: Bug Hunt, medium"],
    bonus: "Come in costume for +1 XP.",
    showXp: 3,
  },
  {
    kind: "cup",
    title: "Midseason Cup",
    pitch: "The first championship. Everyone starts at zero, power-ups come into play, and the winners sign the Golden Keycap.",
    games: ["Output? Lightning", "Wiki Race", "Code Relay", "All-In Bug Hunt"],
    bonus: "Power-ups are earned by showing up in weeks 1–3.",
    showXp: 3,
  },
  {
    kind: "match",
    title: "Code Relay Night",
    pitch: "One keyboard per team. Only the driver types, and you swap every two minutes. Practice for the Final’s relay round.",
    lesson: "Pair programming (3 min): the driver types, the navigators think ahead. Real teams work this way.",
    games: ["Whiteboard Relay (warm-up)", "Code Relay: round 1", "Code Relay: round 2", "Final round ×2: Silent Relay"],
    showXp: 3,
  },
  {
    kind: "cup",
    title: "The Final",
    pitch: "The Season 0 championship. Everyone starts at zero, the Midseason champions defend the Keycap, and the winners sign it.",
    games: ["Output? Lightning", "Wiki Race", "Code Relay", "All-In Bug Hunt"],
    bonus: "Power-ups are earned by showing up in weeks 1–5.",
    showXp: 3,
  },
  {
    kind: "match",
    title: "Boss Battle",
    pitch:
      "The Final is done, so this one is just for fun. Every team takes on the officers in the games you voted for at the kickoff. A short, relaxed night before Thanksgiving.",
    games: ["Top-voted game vs. officers", "Second-voted game vs. officers", "Final round ×2: crowd’s choice"],
    bonus: "Double show-up XP (+6) for coming the night before a holiday. If nobody votes: Wiki Race, Bug Hunt, Guess the Language.",
    note: "Campus is open (the College closes Thursday and Friday for Thanksgiving), but expect a smaller crowd.",
    showXp: 6,
  },
  {
    kind: "wrap",
    title: "Wrap Party & Study Hall",
    pitch:
      "No competition the week before finals. Snacks (pizza if funding comes through), the Season 0 awards, show-and-tell for anything you’ve been building, then stay to study or get help with class projects.",
    games: ["Season 0 awards", "Show & tell: 2-minute demos", "Season 1 brainstorm", "Study hall & project help"],
    bonus: "Awards count XP through week 7, so tonight is just for celebrating.",
    showXp: 3,
  },
];

export const MATCH_AGENDA: Agenda[] = [
  {
    t: "5:00",
    len: 8,
    what: "Lobby",
    detail:
      "Scan the QR to join, squad up into teams of 2–3, warm-up game on screen. Late joiners land on the smallest team automatically.",
  },
  {
    t: "5:08",
    len: 4,
    what: "Mini-lesson",
    detail: "One beginner concept tied to tonight’s game, then a one-minute rules recap.",
  },
  {
    t: "5:12",
    len: 15,
    what: "Round 1",
    detail: "Tonight’s main game, easy version.",
  },
  {
    t: "5:27",
    len: 15,
    what: "Round 2",
    detail: "Same game, harder or with a twist. Late arrivals join here.",
  },
  {
    t: "5:42",
    len: 11,
    what: "Final round ×2",
    detail: "Points are doubled, so any team can still win.",
  },
  {
    t: "5:53",
    len: 5,
    what: "Standings",
    detail: "Winning team picks a prize, read out tonight’s XP, tease next week.",
  },
  {
    t: "5:58",
    len: 2,
    what: "Reset the room",
    detail: "Erase the boards, collect the cards, log off.",
  },
];
export const KICKOFF_AGENDA: Agenda[] = [
  {
    t: "5:00",
    len: 5,
    what: "Lobby",
    detail: "Scan the QR code to join, grab a seat. The title slide shows a warm-up question.",
  },
  {
    t: "5:05",
    len: 7,
    what: "Meet the officers",
    detail: "About 60 seconds each: name, major, fun fact.",
  },
  {
    t: "5:12",
    len: 4,
    what: "What this club is",
    detail: "Purpose, who can join (everyone), and what it costs (nothing).",
  },
  {
    t: "5:16",
    len: 10,
    what: "How Season 0 works",
    detail: "The 8 weeks, teams, XP, and the Golden Keycap.",
  },
  {
    t: "5:26",
    len: 10,
    what: "Your turn: feedback",
    detail: "Sticky-note wall and dot vote, or the feedback form on phones.",
  },
  {
    t: "5:36",
    len: 16,
    what: "First match: Wiki Race",
    detail: "One practice race, then two scored races.",
  },
  {
    t: "5:52",
    len: 8,
    what: "Wrap-up",
    detail: "First standings, Founding Members, join the club’s Teams group, and “bring a classmate next week.”",
  },
];
export const CUP_AGENDA: Agenda[] = [
  {
    t: "4:45",
    len: 15,
    what: "Officers set up",
    detail: "Open /tv on the TV and /host on an officer laptop, deal the power-up cards, set out the sign-in sheet.",
  },
  {
    t: "5:00",
    len: 6,
    what: "Check-in & squad up",
    detail: "Join on your phone, collect your power-ups, make teams in /host, then move people so the strongest players are spread out.",
  },
  {
    t: "5:06",
    len: 3,
    what: "Opening",
    detail: "Everyone starts at 0. Explain power-ups and the All-In final.",
  },
  {
    t: "5:09",
    len: 8,
    what: "Round 1: Output? Lightning",
    detail: "6 quick questions at 1 point each, and the last one is worth 3. Gets everyone warmed up.",
  },
  {
    t: "5:17",
    len: 12,
    what: "Round 2: Wiki Race",
    detail: "Two races, scored by finishing place.",
  },
  {
    t: "5:29",
    len: 14,
    what: "Round 3: Code Relay",
    detail: "One problem, 12-minute cap, swap drivers every 2 minutes.",
  },
  {
    t: "5:43",
    len: 9,
    what: "Round 4: All-In Bug Hunt",
    detail: "Two normal snippets, then teams secretly wager any of their points on one hard snippet.",
  },
  {
    t: "5:52",
    len: 3,
    what: "Final standings",
    detail: "Reveal from last place to first. If there’s a tie, play one sudden-death Output? question.",
  },
  {
    t: "5:55",
    len: 5,
    what: "Trophy",
    detail: "Winners sign the Golden Keycap and take a team photo.",
  },
];
export const FINAL_CHANGES: string[] = [
  "The Midseason champions defend the Keycap. Introduce them before Round 1.",
  "Power-ups count every week attended from 1 to 5, still up to 3 cards.",
  "Season awards wait for the Wrap Party on Dec 2, so the Final runs the full agenda.",
];

export const GAMES: Game[] = [
  {
    id: "wiki",
    name: "Wiki Race",
    gist: "Race from one Wikipedia article to another using only the links on the page.",
    need: "1 phone or laptop per team, internet",
    time: "5 min per race",
    steps: [
      "The TV shows a start and a target article. Everyone opens the start article.",
      "On “Go,” click only the blue links inside the article. No search bar, no typing URLs.",
      "The back button is allowed. So is Ctrl+F (find on page).",
      "When you reach the target, shout “Wiki!” and hold up your screen. A referee checks it.",
    ],
    scoring:
      "1st place 5 points, 2nd 4, 3rd 3. Any other team that finishes within the cap gets 2; teams that don’t finish get 1 for playing.",
    variants: [
      "Fewest Clicks: speed doesn’t matter. The team with the lowest click count wins (6-minute cap). Write each article down as you land on it; the list is your count.",
      "Checkpoint: you must pass through a third article on the way.",
      "Reverse: swap the start and target from the last race.",
    ],
    tip: "Teach the trick after race one: head for big hub pages (countries, “Science,” “Computer”), then narrow down.",
  },
  {
    id: "bug",
    name: "Bug Hunt",
    gist: "A short snippet goes up on the screen with exactly one bug. Find it and fix it.",
    need: "The screen, plus paper or a mini whiteboard per team",
    time: "90 sec (easy) to 2 min (hard) per snippet",
    steps: [
      "The TV shows a numbered snippet and its difficulty.",
      "Teams write down the line number and the corrected line.",
      "When time is up, everyone holds their answers up together.",
      "Reveal the answer, and have the referee explain it in one sentence.",
    ],
    scoring:
      "+1 for the right line, +1 for a working fix, +1 if your team turned its sheet face down (answer locked) before half the time was up.",
    variants: [
      "Bug Bounty: each team writes a buggy snippet on paper and swaps with another team.",
      "Lightning: 45 seconds per snippet, easy ones only.",
    ],
    tip: "Keep a note of the best wrong answer each week, and read it out without naming the team. It decides the “Best Bug” award at the Wrap Party.",
  },
  {
    id: "relay",
    name: "Code Relay",
    gist: "One keyboard per team. Only the driver types, and the driver changes every two minutes.",
    need: "1 lab computer per team, any language your team knows",
    time: "12-minute cap per problem",
    steps: [
      "The problem and its test cases go up on the TV.",
      "Only the driver touches the keyboard. Navigators can talk and point.",
      "The timer chimes every 2 minutes. Swap drivers right away, even mid-line.",
      "When you think you’re done, raise a hand. The referee runs the test cases.",
    ],
    scoring:
      "6 points if every test passes, 3 if some do. The first three teams to solve it get +3, +2, +1. Numbers count if the value is right (60, 60.0, and 60.00 all pass).",
    variants: [
      "Whiteboard Relay (no laptops): each person writes one line, then passes the marker.",
      "Silent Relay: nobody talks. Comments in the code are the only way to communicate.",
    ],
    tip: "Any language works: Python, Java, C++, JavaScript, whatever your team knows. If the lab computers don’t have an editor set up, onecompiler.com runs most languages in the browser with no account.",
  },
  {
    id: "output",
    name: "Output?",
    gist: "What does this code print? Write it down before the reveal.",
    need: "The screen, paper",
    time: "30 sec per question",
    steps: ["A tiny snippet goes up on the screen.", "Teams write down exactly what it prints.", "Reveal and explain in one sentence."],
    scoring: "+1 per correct answer. The last question of the set is worth 3.",
    variants: ["Sudden death: the first correct sheet held up wins. Used as the championship tiebreaker."],
    tip: "This is the best game to run while people are still arriving. Nobody needs a laptop.",
  },
  {
    id: "pictionary",
    name: "Tech Pictionary",
    gist: "Draw a tech word on the whiteboard while your team guesses.",
    need: "Whiteboard and markers",
    time: "60 sec per drawing",
    steps: [
      "The drawer reads the word on an officer’s phone (Host → Pictionary). Never on the TV.",
      "Draw it with no letters, numbers, or symbols.",
      "Your team has 60 seconds. After that, other teams get one guess each to steal.",
    ],
    scoring: "2 points for a correct guess, 1 for a steal.",
    variants: ["Speed round: teams take turns, with one minute on the clock per team."],
    tip: "Zero prep and works with any number of people. Use it to fill the time while the room fills up.",
  },
  {
    id: "lang",
    name: "Guess the Language",
    gist: "A short snippet goes up on the screen. Name the programming language it’s written in.",
    need: "Paper or a whiteboard for each team",
    time: "45 sec per snippet",
    steps: [
      "The TV shows a short snippet.",
      "Teams write down which language they think it is.",
      "Reveal the answer and the tell that gives it away.",
    ],
    scoring: "1 point for a correct answer, 2 if your team locks it in within the first 15 seconds.",
    variants: ["Lightning: 20 seconds per snippet, and only the first correct sheet held up scores."],
    tip: "A great warm-up for beginners. The tells teach what makes each language look the way it does.",
  },
];

export const XP: Xp[] = [
  {
    pts: "+3",
    what: "Show up",
    note: "Showing up is worth as much as winning, and it’s the part you control.",
  },
  {
    pts: "+3 / +2 / +1",
    what: "Your team finishes 1st / 2nd / 3rd that night",
    note: "The biggest gap between teams in one night is 3 XP.",
  },
  {
    pts: "+2",
    what: "Bring someone new",
    note: "You and the classmate you bring each get +2.",
  },
  {
    pts: "+1",
    what: "Theme bonus",
    note: "Costume at Spooky Bugs, and similar.",
  },
  {
    pts: "×2",
    what: "Boss Battle show-up",
    note: "+6 for coming the night before Thanksgiving.",
  },
];
export const COMEBACKS: string[] = [
  "The final round of every night is worth double.",
  "Weekly results become XP by finishing place, not by margin. Winning by 1 point or by 20 is worth the same.",
  "Showing up (+3) is worth as much as winning (+3 to +1). Someone who never misses a week will outrank someone who wins twice and then stops coming.",
  "Championship nights reset everyone to 0. A first-timer can win the Golden Keycap.",
  "All-In Bug Hunt: in the last round of a championship, teams can wager any or all of their points.",
  "Teams are reshuffled every week, so nobody is stuck on a losing team all season.",
];
export const POWERUPS: { name: string; does: string }[] = [
  {
    name: "Ctrl+Z",
    does: "Hand in a second answer on one Bug Hunt or Output? question. The better one counts.",
  },
  {
    name: "Stack Overflow",
    does: "Ask an officer one yes-or-no question during a round.",
  },
  {
    name: "Search Bar",
    does: "Use Wikipedia search once during a Wiki Race, but not for the target article.",
  },
  {
    name: "Double Down",
    does: "Double your team’s points for one round. Play it before the round starts. Not on a ×2 round or the All-In round.",
  },
];
export const POWERUP_RULES: string[] = [
  "Each player gets one power-up card for every week attended before that Cup, up to 3. The Midseason Cup counts weeks 1–3; the Final counts weeks 1–5.",
  "First-timers on a championship night get one Rookie card (any power-up they choose).",
  "Teammates pool their cards, but a team can play only one card per round.",
  "Write the power-up names on index cards. The Secretary hands them out at check-in from the sign-in sheet.",
];
export const AWARDS: Award[] = [
  {
    name: "Season 0 Champions",
    how: "Win the Final on Nov 18. You sign the Golden Keycap.",
  },
  {
    name: "Season MVP",
    how: "Most XP through week 7. Being there every week is how you get it.",
  },
  {
    name: "Rookie of the Season",
    how: "Most XP among people who joined after the kickoff.",
  },
  {
    name: "Best Bug",
    how: "Funniest wrong answer of the season, picked by the officers.",
  },
  {
    name: "Founding Members",
    how: "Everyone who came to the kickoff. Read out the roster.",
  },
];

export const ROLES: { role: string; who: string; does: string }[] = [
  {
    role: "Host",
    who: "President",
    does: "Runs the show: welcome, rules, keeps time, reads the standings.",
  },
  {
    role: "Screen operator",
    who: "Vice President",
    does: "Drives /host: timer, scoreboard, and what’s on the TV. Also sends the weekly reminder (a VP duty in the constitution).",
  },
  {
    role: "Door & XP",
    who: "Secretary",
    does: "Helps people join on their phones, awards bonus XP, exports attendance for the minutes.",
  },
  {
    role: "Referee",
    who: "Treasurer",
    does: "Walks the room, checks Wiki Race finishes, runs relay tests, keeps the prize stash and receipts.",
  },
];
export const PREP: string[] = [
  "Open programmingclub.dev/tv on the TV computer and click once to turn on sound.",
  "Open programmingclub.dev/host on an officer laptop or phone and start tonight’s week.",
  "Put out markers, paper, and the prize stash.",
  "Code Relay or Cup nights: make sure every team computer has an editor or onecompiler.com open.",
  "Cup nights only: write out the power-up cards. /host shows how many each player gets.",
];
export const NEWCOMERS: string[] = [
  "Point them at the QR code on the TV. Joining takes about 20 seconds.",
  "If teams already exist, the app puts them on the smallest team automatically. Move them in /host if needed.",
  "One-sentence pitch: “Tonight’s game is ___. Your team scores points together. No experience needed.”",
  "If they arrive mid-round, they watch with their team and play from the next round.",
  "Before they leave, make sure they’re in the club’s Teams group.",
];
export const SUPPLIES: { tier: string; items: string[] }[] = [
  {
    tier: "Free",
    items: [
      "The gaming-room TV and lab computers",
      "Phones for joining (anyone without one can be added from /host)",
      "Whiteboard, markers, scrap paper, pens",
      "Index cards and sticky notes, if Student Activities has a supply closet",
    ],
  },
  {
    tier: "About $30",
    items: [
      "A giant novelty Enter key and a can of gold spray paint: this becomes the Golden Keycap trophy",
      "Blank keycaps or programming stickers for the weekly winning team",
      "Index cards for power-ups, plus sticky notes for the kickoff feedback wall",
      "Sheet protectors with white paper inside: cheap reusable mini whiteboards",
    ],
  },
  {
    tier: "If there’s funding",
    items: [
      "Pizza on the two championship nights and the Wrap Party (ask Student Activities about event food funding). Order halal and vegetarian options.",
      "Candy for weekly winners and Pictionary steals",
      "Printed posters (ask whether Student Activities prints for clubs)",
    ],
  },
];
export const MONEY_NOTE =
  "Under the constitution (Article 10), spending has to be approved at a meeting and recorded in the minutes, and needs College approval before money is committed. The Treasurer collects the signatures. Put a vote on the prize budget in the kickoff minutes.";
export const PROMO: { idea: string; how: string }[] = [
  {
    idea: "Ask instructors to announce it",
    how: "Email the professors teaching intro CIS/CS courses and ask them to read the 20-second script below in class. This reaches the most beginners for the least effort.",
  },
  {
    idea: "The club’s Teams group",
    how: "Everyone is already in it. Post a reminder on Tuesday and again on Wednesday at noon, and use Microsoft Forms in Teams for quick polls.",
  },
  {
    idea: "Post the leaderboard every Thursday",
    how: "Post a screenshot of programmingclub.dev/hello-world/scores and a photo of the winners in Teams. People come back to defend their spot.",
  },
  {
    idea: "Bring-a-classmate XP",
    how: "+2 XP each for the member and the HFC classmate they bring. Mention it at the end of every meeting.",
  },
  {
    idea: "Posters with a QR code",
    how: "Put them near CIS classrooms, the library, the student center, and on the gaming-room door. Point the QR code at programmingclub.dev.",
  },
  {
    idea: "Student Activities channels",
    how: "Campus newsletter, digital screens, and any club fair tables left this semester.",
  },
  {
    idea: "15-second clips",
    how: "Film the end of a Wiki Race (“Wiki!”) or a Golden Keycap signing. Short and loud does well on social.",
  },
];
export const POSTER_LINES: string[] = [
  "Can’t code yet? Perfect.",
  "Wiki races, bug hunts, and a golden keycap.",
  "No experience. No homework. Just show up.",
];
export const ANNOUNCEMENT =
  "Hi everyone, quick announcement from the Programming Club. We meet Wednesdays from 5 to 6 in the Gaming Room, and this semester we’re running a team game league called the Hello, World Cup: Wikipedia races, bug hunts, code relays. You don’t need any experience and there’s no homework. It’s free, and you can join any week. Come play. Details are at programmingclub.dev.";
export const CAPTIONS: string[] = [
  "Week {n} high scores are up 🕹️ Come knock them off the board Wednesday, 5–6, Gaming Room.",
  "Pizza → Moon in 4 clicks. Think you can beat it? Wiki Race Night, Wednesday 5–6.",
  "Never coded before? Most of us hadn’t either. Wednesdays 5–6, Gaming Room, no experience needed.",
];
export const FEEDBACK: string[] = [
  "What brought you here tonight? (learn, build things, compete, hang out, career)",
  "What should the club offer next semester? (workshops, projects, hackathon, game dev, interview prep, guest speakers, …)",
  "What languages are you using or learning?",
  "Does Wednesday 5–6 work for you?",
  "What one thing would make you come back every week?",
];
export const WALL_CATEGORIES: string[] = ["Learn", "Build", "Compete", "Hang out"];
export const REMIX_MENU: string[] = [
  "Guess the Language",
  "Output? Showdown",
  "Reverse Wiki Race",
  "Tech Pictionary tournament",
  "Bug Bounty (write bugs for other teams)",
  "More Code Relay",
];

export const WIKI_RACES: WikiRace[] = [
  {
    from: "Pizza",
    to: "Moon",
  },
  {
    from: "Taylor Swift",
    to: "Computer",
    cs: true,
  },
  {
    from: "Detroit",
    to: "Video game",
    cs: true,
  },
  {
    from: "Henry Ford",
    to: "Internet",
    cs: true,
  },
  {
    from: "Coffee",
    to: "Albert Einstein",
  },
  {
    from: "Basketball",
    to: "Python (programming language)",
    cs: true,
  },
  {
    from: "Minecraft",
    to: "Ancient Egypt",
  },
  {
    from: "Cat",
    to: "Alan Turing",
    cs: true,
  },
  {
    from: "Dearborn, Michigan",
    to: "Pokémon",
  },
  {
    from: "Banana",
    to: "NASA",
  },
  {
    from: "SpongeBob SquarePants",
    to: "Isaac Newton",
  },
  {
    from: "Lego",
    to: "Ada Lovelace",
    cs: true,
  },
  {
    from: "Mario",
    to: "Great Wall of China",
  },
  {
    from: "Hamburger",
    to: "Grace Hopper",
    cs: true,
  },
  {
    from: "Spider-Man",
    to: "Linux",
    cs: true,
  },
  {
    from: "Ford Mustang",
    to: "Artificial intelligence",
    cs: true,
  },
  {
    from: "Chess",
    to: "Steve Jobs",
    cs: true,
  },
  {
    from: "Penguin",
    to: "Bill Gates",
    cs: true,
  },
  {
    from: "Volcano",
    to: "JavaScript",
    cs: true,
  },
  {
    from: "Olympic Games",
    to: "Binary number",
    cs: true,
  },
  {
    from: "Rubber duck",
    to: "Debugging",
    cs: true,
  },
  {
    from: "Hip hop music",
    to: "Moore's law",
    cs: true,
  },
  {
    from: "Taco",
    to: "Mount Everest",
  },
  {
    from: "FIFA World Cup",
    to: '"Hello, World!" program',
    cs: true,
  },
  {
    from: "Detroit Lions",
    to: "Tim Berners-Lee",
    cs: true,
  },
  {
    from: "Michigan",
    to: "Nintendo",
  },
  {
    from: "Halloween",
    to: "Computer virus",
    cs: true,
  },
  {
    from: "Thanksgiving",
    to: "Smartphone",
    cs: true,
  },
];
export const BUGS: Bug[] = [
  {
    level: "easy",
    code: 'name = input("Name? ")\nif name == "Ada"\n    print("Hi, Ada!")',
    line: "2",
    fix: 'if name == "Ada":',
    why: "An if line has to end with a colon.",
  },
  {
    level: "easy",
    code: 'score = 10\nif score = 10:\n    print("Perfect!")',
    line: "2",
    fix: "if score == 10:",
    why: "= stores a value; == compares two values.",
  },
  {
    level: "easy",
    code: 'age = 19\nprint("You are " + age + " years old")',
    line: "2",
    fix: 'print("You are " + str(age) + " years old")',
    why: "You can’t add text and a number. Convert with str(), or use an f-string.",
  },
  {
    level: "easy",
    code: 'print("Welcome to the club!)',
    line: "1",
    fix: 'print("Welcome to the club!")',
    why: "The string never closes. Every opening quote needs a closing one.",
  },
  {
    level: "easy",
    code: 'for i in range(3):\nprint("Hip hip hooray!")',
    line: "2",
    fix: '    print("Hip hip hooray!")',
    why: "Code inside a loop has to be indented.",
  },
  {
    level: "easy",
    spooky: true,
    code: 'pumpkins = 3\npumpkins + 2\nprint("Pumpkins:", pumpkins)',
    line: "2",
    fix: "pumpkins = pumpkins + 2",
    why: "Line 2 calculates 5 and throws it away. You have to store the result.",
  },
  {
    level: "easy",
    spooky: true,
    code: 'def scare(name)\n    print("BOO,", name + "!")\n\nscare("Ada")',
    line: "1",
    fix: "def scare(name):",
    why: "A function definition needs a colon too.",
  },
  {
    level: "medium",
    code: "# Print 1 through 10\nfor n in range(1, 10):\n    print(n)",
    line: "2",
    fix: "for n in range(1, 11):",
    why: "range stops before the end number, so this prints 1 to 9.",
  },
  {
    level: "medium",
    code: 'a = input("First number: ")\nb = input("Second number: ")\nprint("Sum:", a + b)',
    line: "3 (or 1 and 2)",
    fix: 'print("Sum:", int(a) + int(b))',
    why: 'input() always returns text, so 2 and 3 gives "23".',
  },
  {
    level: "medium",
    code: 'snacks = ["chips", "pizza", "tacos"]\nprint("Last snack:", snacks[3])',
    line: "2",
    fix: "snacks[2]  (or snacks[-1])",
    why: "Counting starts at 0, so three items are numbered 0, 1, 2.",
  },
  {
    level: "medium",
    code: 'total = 0\nfor price in [3, 5, 2]:\n    total = total + price\nprint("Total:", Total)',
    line: "4",
    fix: 'print("Total:", total)',
    why: "Python is case-sensitive. Total and total are different names.",
  },
  {
    level: "medium",
    code: "def double(x):\n    x * 2\n\nprint(double(21))",
    line: "2",
    fix: "    return x * 2",
    why: "Without return, the function hands back None.",
  },
  {
    level: "medium",
    code: 'count = 3\nwhile count > 0:\n    print(count)\nprint("Liftoff!")',
    line: "3 (missing line after it; accept 2)",
    fix: "    count = count - 1   ← add inside the loop",
    why: "count never changes, so the loop runs forever.",
  },
  {
    level: "medium",
    spooky: true,
    code: 'ghosts = ["Boo", "Casper", "Slimer"]\nfor i in range(len(ghosts) + 1):\n    print("Summoning", ghosts[i])',
    line: "2",
    fix: "for i in range(len(ghosts)):",
    why: "The + 1 asks for a fourth ghost that doesn’t exist (IndexError).",
  },
  {
    level: "medium",
    code: 'answer = input("Continue? (yes/no) ")\nif answer == "Yes":\n    print("Let\'s go!")',
    line: "2",
    fix: 'if answer.lower() == "yes":',
    why: "The prompt says “yes,” but the code checks for “Yes.” Capital letters matter.",
  },
  {
    level: "hard",
    code: 'day = "Monday"\nif day == "Saturday" or "Sunday":\n    print("Weekend!")\nelse:\n    print("Back to class.")',
    line: "2",
    fix: 'if day == "Saturday" or day == "Sunday":',
    why: 'A non-empty string like "Sunday" counts as true by itself, so this prints Weekend! on a Monday.',
  },
  {
    level: "medium",
    code: 'scores = [90, 80, 70, 100]\ntotal = 0\nfor s in scores:\n    total += s\naverage = total / 3\nprint("Average:", average)',
    line: "5",
    fix: "average = total / len(scores)",
    why: "There are 4 scores, not 3. len() counts them for you.",
  },
  {
    level: "hard",
    code: "numbers = [4, 8, 15, 16]\nfor n in numbers:\n    total = 0\n    total = total + n\nprint(total)",
    line: "3",
    fix: "Move total = 0 above the loop",
    why: "The total resets on every pass, so this prints 16 instead of 43.",
  },
  {
    level: "hard",
    code: 'temps = [-5, -2, -9, -1]\nhighest = 0\nfor t in temps:\n    if t > highest:\n        highest = t\nprint("Highest:", highest)',
    line: "2",
    fix: "highest = temps[0]",
    why: "Every temperature is below 0, so this prints 0, which isn’t in the list.",
  },
];
export const OUTPUTS: OutputQ[] = [
  {
    code: "print(3 + 4 * 2)",
    answer: "11",
    why: "Multiplication happens before addition.",
  },
  {
    code: 'print("ha" * 3)',
    answer: "hahaha",
    why: "Multiplying a string repeats it.",
  },
  {
    code: "print(7 // 2)",
    answer: "3",
    why: "// divides and drops the remainder.",
  },
  {
    code: "print(7 % 2)",
    answer: "1",
    why: "% gives the remainder.",
  },
  {
    code: "x = 5\nx = x + 1\nprint(x)",
    answer: "6",
    why: "Take the old x, add 1, store it back in x.",
  },
  {
    code: 'print(len("Hello, World!"))',
    answer: "13",
    why: "The comma, the space, and the ! all count.",
  },
  {
    code: 'word = "duck"\nprint(word[0] + word[-1])',
    answer: "dk",
    why: "[0] is the first letter and [-1] is the last.",
  },
  {
    code: "for i in range(3):\n    print(i)",
    answer: "0\n1\n2",
    why: "range(3) counts 0, 1, 2 and stops before 3.",
  },
  {
    code: "print(10 / 4)",
    answer: "2.5",
    why: "A single / always gives a decimal.",
  },
  {
    code: "nums = [1, 2, 3]\nnums.append(4)\nprint(len(nums))",
    answer: "4",
    why: "append adds one item to the end.",
  },
  {
    code: 'print("5" + "5")',
    answer: "55",
    why: "Those are strings, so + joins them.",
  },
  {
    code: "print(2 ** 3)",
    answer: "8",
    why: "** is “to the power of.”",
  },
  {
    code: "a = 3\nb = a\na = 10\nprint(b)",
    answer: "3",
    why: "b copied the value 3. Changing a later doesn’t change b.",
  },
  {
    code: "print(not True)",
    answer: "False",
    why: "not flips True and False.",
  },
  {
    code: 's = "Programming"\nprint(s[0:3])',
    answer: "Pro",
    why: "A slice includes the start and stops before the end: positions 0, 1, 2.",
  },
  {
    code: 'x = 10\nif x > 5:\n    print("big")\nelse:\n    print("small")',
    answer: "big",
    why: "10 is greater than 5, so the if branch runs.",
  },
  {
    code: 'print("Wed".upper())',
    answer: "WED",
    why: ".upper() makes every letter a capital.",
  },
  {
    code: "total = 0\nfor n in [1, 2, 3, 4]:\n    total += n\nprint(total)",
    answer: "10",
    why: "1 + 2 + 3 + 4.",
  },
  {
    code: "print(round(3.7))",
    answer: "4",
    why: "round goes to the nearest whole number.",
  },
  {
    code: 'x = "7"\nprint(x * 2)',
    answer: "77",
    why: "x is text, so it repeats instead of doubling.",
  },
  {
    code: "print(len([1, [2, 3], 4]))",
    answer: "3",
    why: "The inner list [2, 3] counts as one item.",
    tiebreak: true,
  },
];
export const RELAYS: Relay[] = [
  {
    name: "Greeting machine",
    level: "easy",
    task: "Ask for the user’s name, then print exactly: Hello, <name>! Welcome to the club.",
    tests: [["Ada", "Hello, Ada! Welcome to the club."]],
  },
  {
    name: "Even or odd",
    level: "easy",
    task: "Ask for a whole number. Print “even” or “odd.”",
    tests: [
      ["4", "even"],
      ["7", "odd"],
      ["0", "even"],
    ],
  },
  {
    name: "Countdown",
    level: "easy",
    task: "Ask for a number n. Print n down to 1 (one per line), then “Liftoff!”",
    tests: [["3", "3 / 2 / 1 / Liftoff!"]],
  },
  {
    name: "Temperature converter",
    level: "easy",
    task: "Ask for a temperature in Fahrenheit and print it in Celsius, rounded to one decimal place. Formula: (F − 32) × 5 ÷ 9",
    tests: [
      ["32", "0.0"],
      ["212", "100.0"],
      ["98.6", "37.0"],
    ],
  },
  {
    name: "Tip calculator",
    level: "easy",
    task: "Ask for the bill and the tip percent. Print the total.",
    tests: [
      ["50, 20", "60.0"],
      ["30, 15", "34.5"],
    ],
  },
  {
    name: "Letter grade",
    level: "medium",
    task: "Ask for a score. Print A for 90+, B for 80+, C for 70+, otherwise “Keep going!”",
    tests: [
      ["95", "A"],
      ["82", "B"],
      ["40", "Keep going!"],
    ],
  },
  {
    name: "Vowel counter",
    level: "medium",
    task: "Ask for a word and print how many vowels (a, e, i, o, u) it has. Uppercase counts too.",
    tests: [
      ["duck", "1"],
      ["programming", "3"],
      ["AEIOU", "5"],
    ],
  },
  {
    name: "Palindrome check",
    level: "medium",
    task: "Ask for a word. Print it backwards, then print “yes” if it’s a palindrome (same both ways) or “no” if not.",
    tests: [
      ["racecar", "racecar / yes"],
      ["duck", "kcud / no"],
    ],
  },
  {
    name: "FizzBuzz",
    level: "medium",
    task: "Print 1 to 15, but print Fizz for multiples of 3, Buzz for multiples of 5, and FizzBuzz for both. One line or one per line both count.",
    tests: [["(none)", "1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz"]],
  },
  {
    name: "Biggest of three",
    level: "medium",
    task: "Ask for three numbers and print the biggest.",
    tests: [
      ["3, 9, 4", "9"],
      ["-1, -7, -3", "-1"],
    ],
  },
];
export const PICTIONARY: string[] = [
  "bug",
  "cloud",
  "mouse",
  "keyboard",
  "firewall",
  "virus",
  "smartwatch",
  "Python",
  "Java",
  "Apple",
  "robot",
  "Wi-Fi",
  "password",
  "loop",
  "laptop",
  "email",
  "hard drive",
  "router",
  "webcam",
  "USB stick",
  "emoji",
  "video game",
  "motherboard",
  "recycle bin",
  "cookie",
  "web",
  "server",
  "app",
  "selfie",
  "charger",
  "rubber duck",
  "hacker",
  "printer jam",
  "touchscreen",
  "VR headset",
  "battery low",
  "loading spinner",
  "copy and paste",
  "headphones",
  "QR code",
  "satellite",
  "drone",
];
export const LANGS: LangQ[] = [
  { lang: "Python", code: 'for i in range(3):\n    print("hi")', tell: "Indentation instead of braces, and range()." },
  {
    lang: "JavaScript",
    code: "const nums = [1, 2, 3];\nconsole.log(nums.map((n) => n * 2));",
    tell: "console.log and the => arrow function. (Also valid TypeScript, so accept that.)",
  },
  {
    lang: "Java",
    code: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hi");\n  }\n}',
    tell: "public static void main and System.out.println.",
  },
  {
    lang: "C",
    code: '#include <stdio.h>\n\nint main(void) {\n  printf("%d\\n", 42);\n  return 0;\n}',
    tell: "#include <stdio.h> and printf. (It also compiles as C++, so accept that.)",
  },
  {
    lang: "C++",
    code: '#include <iostream>\n\nint main() {\n  std::cout << "Hi" << std::endl;\n}',
    tell: "std::cout and the << operator.",
  },
  { lang: "SQL", code: "SELECT name, score\nFROM players\nWHERE score > 10\nORDER BY score DESC;", tell: "SELECT … FROM … WHERE." },
  { lang: "Ruby", code: '3.times do |i|\n  puts "Hi #{i}"\nend', tell: "do |i| … end, puts, and #{} inside a string." },
  {
    lang: "Go",
    code: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hi")\n}',
    tell: "package main, func, and fmt.Println.",
  },
  {
    lang: "Rust",
    code: 'fn main() {\n    let name = "Ferris";\n    println!("Hi, {}!", name);\n}',
    tell: "fn and the println! macro (the ! gives it away).",
  },
  {
    lang: "HTML",
    code: "<ul>\n  <li>Wiki Race</li>\n  <li>Bug Hunt</li>\n</ul>",
    tell: "Tags in angle brackets. HTML describes what’s on a page rather than giving step-by-step instructions.",
  },
  {
    lang: "Bash",
    code: 'for f in *.txt; do\n  echo "$f"\ndone',
    tell: "do … done, echo, and $ before variables. (Any Unix shell runs this, so accept “shell” or zsh.)",
  },
  {
    lang: "Swift",
    code: 'let names = ["Ada", "Grace"]\nfor name in names {\n    print("Hi, \\(name)")\n}',
    tell: "\\(name) inside a string, let, and no semicolons.",
  },
  {
    lang: "Kotlin",
    code: 'fun main() {\n    val langs = listOf("Kotlin", "Java")\n    println(langs.size)\n}',
    tell: "fun, val, and listOf.",
  },
  {
    lang: "C#",
    code: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hi");\n    }\n}',
    tell: "Console.WriteLine and a capital-M Main.",
  },
  { lang: "PHP", code: '<?php\n$name = "Ada";\necho "Hi, $name";', tell: "<?php at the top and $ on every variable." },
  { lang: "Lua", code: 'for i = 1, 3 do\n  print("hi")\nend', tell: "for i = 1, 3 do … end." },
];

// More activities for the season planner, gathered from real club, classroom, and event formats.
// Round lengths and scoring are suggestions sized for a 60-minute night with teams of 2–3.
export const IDEAS: Idea[] = [
  // Coding challenges: any language, answers checked by output.
  {
    name: "Black Box",
    group: "Coding challenges",
    how: "An officer has a hidden function on a card. Teams spend a fixed budget of test inputs, see the outputs, then write the function in any language. Wrong guesses cost points.",
    time: "10–15 min",
    need: "Index cards with about 10 secret functions, a whiteboard for the query log",
  },
  {
    name: "Problem Ladder",
    group: "Coding challenges",
    how: "An Advent of Code–style puzzle in two parts. Part 2 twists part 1 and unlocks once a team submits the right answer. Teams submit answers only, so any language works, and part 2 is worth more.",
    time: "15–20 min",
    need: "A printed two-part puzzle with an input and answer key",
    link: "https://projecteuler.net/",
    cup: true,
  },
  {
    name: "Parsons Scramble",
    group: "Coding challenges",
    how: "The lines of a short program are shuffled with a few decoy lines mixed in. The first team to put the right lines in the right order wins. Using a decoy costs a point.",
    time: "5–10 min",
    need: "Printed strips of code lines, or a shuffled list on the TV",
  },
  {
    name: "Code Golf Sprint",
    group: "Coding challenges",
    how: "Every team solves the same small task. Once it passes the tests, the shortest solution wins. Any correct answer still earns partial points.",
    time: "10–15 min",
    need: "A task with test cases and an agreed rule for counting characters",
  },
  {
    name: "ASCII Golf",
    group: "Coding challenges",
    how: "The TV shows a small ASCII picture. Teams write a program in any language that prints it exactly, in as few characters as possible. A perfect match comes first, then length.",
    time: "15 min",
    need: "A few target pictures and a way to compare output",
    link: "https://cssbattle.dev/faqs",
  },
  {
    name: "Reverse Clash",
    group: "Coding challenges",
    how: "Teams see only the test cases, inputs and expected outputs, with no description. They work out what the program should do and write it. First to pass every test wins.",
    time: "10–15 min",
    need: "A few input/output test sets, or a free CodinGame Clash of Code room",
    link: "https://www.codingame.com/multiplayer/clashofcode",
  },
  {
    name: "Refactor Race",
    group: "Coding challenges",
    how: "Teams get working but ugly code and make it as readable as they can while the tests still pass. The room votes on the cleanest version.",
    time: "10–15 min",
    need: "A messy snippet with a few tests",
  },

  // Unplugged: paper, cards, and whiteboards, no computers.
  {
    name: "Human Bubble Sort",
    group: "Unplugged",
    how: "Each team gets shuffled number cards and may only compare and swap neighbors. Fewest swaps to a correct order wins, plus a bonus for explaining the rule they followed.",
    time: "8–10 min",
    need: "Index cards with numbers, one set per team",
    link: "https://makecode.microbit.org/courses/csintro/arrays/unplugged",
  },
  {
    name: "Pancake Flip Race",
    group: "Unplugged",
    how: "Teams sort a stack of different-sized paper strips biggest-at-bottom, but the only move is flipping the top few as a group. Fewest flips wins.",
    time: "10 min",
    need: "6–8 paper strips or cups of different sizes per team",
  },
  {
    name: "Battleship Search",
    group: "Unplugged",
    how: "Each team hides a ship on a 5×5 grid and the others hunt for it. Hiders answer only “higher” or “lower,” so teams that halve the search find it fastest. It’s binary search in disguise.",
    time: "10 min",
    need: "Graph paper and pencils",
    link: "https://classic.csunplugged.org/activities/searching-algorithms/",
  },
  {
    name: "Sorting Network Race",
    group: "Unplugged",
    how: "A sorting network is drawn on the whiteboard or floor. Teams run number cards through the comparators, and the first team to come out sorted scores. Then they race to design a faster network.",
    time: "10–15 min",
    need: "A whiteboard or painter’s tape, number cards",
    link: "https://classic.csunplugged.org/activities/sorting-networks/",
  },
  {
    name: "Binary Dot Cards",
    group: "Unplugged",
    how: "Each team has five cards with 16, 8, 4, 2, and 1 dots. The host calls a number and teams flip cards to show it in binary. Then it reverses: the host shows a pattern and teams shout the number.",
    time: "5 min",
    need: "Five dot cards per team",
    link: "https://classic.csunplugged.org/activities/binary-numbers/",
  },
  {
    name: "Parity Card Trick",
    group: "Unplugged",
    how: "A team lays out a grid of two-sided cards and adds an extra row and column to make each line even. The other team secretly flips one card, and the first team finds it using the parity checks.",
    time: "8 min",
    need: "About 36 two-color cards or paper squares",
    link: "https://classic.csunplugged.org/activities/error-detection/",
  },
  {
    name: "Treasure Island",
    group: "Unplugged",
    how: "The whiteboard shows islands connected by red and blue routes. Teams follow a sequence of colors and say which island they end on. It teaches finite state machines.",
    time: "10 min",
    need: "A map drawn on the whiteboard, color sequences",
    link: "https://classic.csunplugged.org/activities/finite-state-automata/",
  },
  {
    name: "Bebras Card Sprint",
    group: "Unplugged",
    how: "Teams race through printed Bebras logic puzzles. Each correct answer is a point and wrong answers cost a little. Trailing teams get one hint per card.",
    time: "10–15 min",
    need: "Printed Bebras task cards",
    link: "https://www.bebras.org/",
  },

  // Game shows: run on the TV, teams answer on paper or whiteboards.
  {
    name: "Survey Says",
    group: "Game shows",
    how: "Family Feud with developer survey results. “Name a language people use for websites.” Teams write their guess, and more popular answers score more. The answer key comes from the Stack Overflow Developer Survey.",
    time: "5–10 min",
    need: "5 prompts with answers from the survey",
    link: "https://survey.stackoverflow.co/",
    cup: true,
  },
  {
    name: "Wavelength: Tech Edition",
    group: "Game shows",
    how: "One player sees a hidden spot on a spectrum like Tabs ↔ Spaces or Frontend ↔ Backend and gives a one-word clue. Their team guesses the spot. Bullseye is 4 points, and a team still behind after a bullseye goes again.",
    time: "5 min per turn",
    need: "20 tech spectrums, a slider drawn on the whiteboard",
    link: "https://www.gamerules.com/rules/wavelength/",
  },
  {
    name: "Higher or Lower: GitHub Stars",
    group: "Game shows",
    how: "Two repos on the TV. One shows its star count, and teams write “higher” or “lower” for the other. A wrong call passes the question to the next team.",
    time: "5 min",
    need: "20 repos with star counts noted on the same day",
  },
  {
    name: "Wayback Year",
    group: "Game shows",
    how: "The TV shows an old homepage from the Wayback Machine and teams write the year. Closest wins the round, and the lowest total miss after five sites wins.",
    time: "8 min",
    need: "10 archived homepages from web.archive.org",
    link: "https://web.archive.org/",
  },
  {
    name: "Name That Error",
    group: "Game shows",
    how: "A real error message appears on the TV. Teams write the language and what probably caused it. The last error is worth double.",
    time: "5 min",
    need: "5–10 error messages copied from Python, JavaScript, and Java",
  },
  {
    name: "Pokémon or Programming?",
    group: "Game shows",
    how: "The host reads a word like “Bulbasaur” or “Kubernetes” and teams write whether it’s a Pokémon or a programming tool. The final round counts double.",
    time: "5 min",
    need: "A list of about 20 names",
  },
  {
    name: "Tech Taboo",
    group: "Game shows",
    how: "One player describes a term like API or recursion without saying the banned words on the card. Their team has 60 seconds to guess, and other teams can steal.",
    time: "10 min",
    need: "20 cards, each with a term and five banned words",
    link: "https://www.101computing.net/taboo-revision-game-a-level/",
  },
  {
    name: "Codenames: Tech Edition",
    group: "Game shows",
    how: "Codenames with a grid of 25 tech words. Each team’s spymaster gives one-word clues to find their words. Play best of three and let the losing team pick first.",
    time: "10–15 min",
    need: "25 tech words, or the free open-source Decknamen with a custom list",
    link: "https://github.com/pichfl/decknamen",
  },
  {
    name: "Two Truths and a Lie",
    group: "Game shows",
    how: "Each player says three things, at least one about tech, and the other team spots the lie. One point for every player who fools them. Good for the first few weeks.",
    time: "5–10 min",
    need: "Nothing",
  },

  // Browser races: free sites on the lab computers.
  {
    name: "Flexbox Froggy",
    group: "Browser races",
    how: "Teams write CSS flexbox rules to move frogs onto lily pads. Most levels cleared in 10 minutes wins, and ties go to fewer resets.",
    time: "10 min",
    need: "Lab computers, no account",
    link: "https://flexboxfroggy.com/",
  },
  {
    name: "Grid Garden",
    group: "Browser races",
    how: "Same idea as Flexbox Froggy, but with CSS Grid watering a carrot garden. Run it right after Froggy as a second round.",
    time: "10 min",
    need: "Lab computers, no account",
    link: "https://cssgridgarden.com/",
  },
  {
    name: "RegexOne Race",
    group: "Browser races",
    how: "Teams work through the regex lessons and practice problems in order. A point per problem passed, plus a bonus for finishing first.",
    time: "15 min",
    need: "Lab computers, no account",
    link: "https://regexone.com/",
  },
  {
    name: "SQL Murder Mystery",
    group: "Browser races",
    how: "Teams query a police database to find who did it. First team to name the killer wins, and teams that are stuck get a hint every 5 minutes.",
    time: "20 min",
    need: "Lab computers",
    link: "https://mystery.knightlab.com/",
    cup: true,
    check: "Make sure it loads on the lab computers before the night.",
  },
  {
    name: "SQLBolt Sprint",
    group: "Browser races",
    how: "Teams race through interactive SQL lessons. A point per exercise an officer checks off, and the JOIN lessons count double.",
    time: "15 min",
    need: "Lab computers, no account",
    link: "https://sqlbolt.com/",
  },
  {
    name: "Elevator Saga",
    group: "Browser races",
    how: "Teams write JavaScript to run a bank of elevators. Highest score on the same challenge after 15 minutes wins. Best for teams with a little JavaScript.",
    time: "15 min",
    need: "Lab computers, no account",
    link: "https://play.elevatorsaga.com/",
  },
  {
    name: "Untrusted",
    group: "Browser races",
    how: "Teams edit the game’s own JavaScript to escape each level. Most levels cleared wins, and a hint costs 2 minutes. Hard, so use it as a finale.",
    time: "15 min",
    need: "Lab computers, no account",
    link: "https://untrustedgame.com/",
    cup: true,
  },

  // Build and demo: make something fast, then show it off.
  {
    name: "Worst Website Showdown",
    group: "Build and demo",
    how: "Each team draws a random brief (a cheese shop, a parking app) and has 10 minutes to build the most gloriously broken one-page site. 60-second demos, and the room votes.",
    time: "15 min",
    need: "An online HTML editor, briefs on a slide",
    cup: true,
  },
  {
    name: "Code in the Dark",
    group: "Build and demo",
    how: "Teams rebuild a website from a screenshot in HTML and CSS without ever seeing a preview. Everyone reveals at once on the TV and the room votes. The mistakes are the best part.",
    time: "15 min",
    need: "An editor with the preview hidden, one screenshot per round",
    link: "https://hamatti.org/posts/we-organized-code-in-the-dark-event/",
  },
  {
    name: "Scratch Jam",
    group: "Build and demo",
    how: "Teams start from a Scratch template and must add something interactive in 20 minutes. Short demos, scored in a few categories so a simple finished game can win.",
    time: "20 min",
    need: "scratch.mit.edu on the lab computers",
    link: "https://scratch.mit.edu/",
  },
  {
    name: "PowerPoint Karaoke",
    group: "Build and demo",
    how: "A team draws a topic and gives a 60-second talk over five slides they’ve never seen. The room cheers for the winner. No coding, lots of laughs.",
    time: "3 min per team",
    need: "A deck of random slides, topic slips in a bowl",
  },
  {
    name: "Explain It Like I’m Five",
    group: "Build and demo",
    how: "Each team draws a concept card (a loop, an API, git push) and explains it in 60 seconds to an officer playing a five-year-old, who gets one “but why?” A point if the officer can repeat it back.",
    time: "3 min per team",
    need: "Concept cards",
  },
  {
    name: "picoCTF Flag Race",
    group: "Build and demo",
    how: "Teams race to capture flags on beginner picoCTF challenges. Early flags are worth more, and hints cost points, so a slow start can still catch up.",
    time: "15 min",
    need: "Free picoCTF accounts made before the night, six easy challenges picked ahead",
    link: "https://picoctf.org/",
    cup: true,
    check: "Accounts take a few minutes to make, so have everyone sign up the week before.",
  },
  {
    name: "Interview Tournament",
    group: "Build and demo",
    how: "Teams solve three easy interview-style problems in any language and explain each one out loud. Later problems are worth more.",
    time: "25 min",
    need: "Three easy problems with tests, a timer on the TV",
    cup: true,
  },
  {
    name: "Challenge Ladder",
    group: "Build and demo",
    how: "The TV shows six mini-challenges worth different points: stack 10 cups, fix a three-line bug, write a haiku in code. Teams pick any order and check in when done.",
    time: "15 min",
    need: "Cups, a few short tasks, the TV",
    link: "https://events.mlh.com/",
  },
];
