// "Fix it for real": the double-points final on Bug Hunt nights.
// Each team gets one buggy Python program in an in-browser editor, runs it, edits it,
// and is marked "Fixed!" once every test passes. Plain data; every card has exactly one bug.
import type { BugSource, Level } from "./types";

export interface FixTest {
  /** stdin, one value per line (may be empty). */
  input: string;
  /** Exact expected stdout. Trailing whitespace and newlines are ignored. */
  output: string;
  /** Shown to teams as an example; the rest are hidden. */
  show?: boolean;
}

export interface FixCard {
  name: string;
  level: Level;
  spooky?: boolean;
  /** What the program is supposed to do, so teams know what "fixed" means. */
  task: string;
  /** The buggy program. Reads input() with no prompt, one value per line. */
  code: string;
  tests: FixTest[];
  /** The corrected program, shown on reveal. */
  fix: string;
  /** One sentence explaining the bug, shown on reveal. */
  why: string;
  /** Nudge for stuck teams, without giving the fix away. */
  hint: string;
  /** For a card cut from a real bug: the advisory, credited on reveal. */
  source?: BugSource;
}

export const FIXES: FixCard[] = [
  {
    name: "pumpkin patch",
    level: "easy",
    task: "Read how many pumpkins you have, then how many more you picked, and print the new total. More than 10 pumpkins means pie.",
    code: `print("Welcome to the pumpkin patch!")
pumpkins = input()
picked = int(input())
total = pumpkins + picked
print("You now have", total, "pumpkins")
if total > 10:
    print("That's a lot of pie!")`,
    tests: [
      { input: "3\n2", output: "Welcome to the pumpkin patch!\nYou now have 5 pumpkins", show: true },
      { input: "8\n4", output: "Welcome to the pumpkin patch!\nYou now have 12 pumpkins\nThat's a lot of pie!" },
      { input: "10\n0", output: "Welcome to the pumpkin patch!\nYou now have 10 pumpkins" },
      { input: "0\n11", output: "Welcome to the pumpkin patch!\nYou now have 11 pumpkins\nThat's a lot of pie!" },
    ],
    fix: `print("Welcome to the pumpkin patch!")
pumpkins = int(input())
picked = int(input())
total = pumpkins + picked
print("You now have", total, "pumpkins")
if total > 10:
    print("That's a lot of pie!")`,
    why: "input() always gives back text, so pumpkins is a string and Python can’t add a string to a number. Wrap it in int().",
    hint: "Read the TypeError, then compare how line 2 and line 3 read their input.",
  },
  {
    name: "candy haul",
    level: "medium",
    task: "The first line is how many houses you visited, then one line per house with how many candies you got. Print the total candy.",
    code: `houses = int(input())
for house in range(houses):
    total = 0
    candy = int(input())
    total = total + candy
print("Total candy:", total)`,
    tests: [
      { input: "3\n4\n2\n5", output: "Total candy: 11", show: true },
      { input: "1\n7", output: "Total candy: 7" },
      { input: "4\n0\n6\n3\n0", output: "Total candy: 9" },
      { input: "2\n10\n10", output: "Total candy: 20" },
      { input: "5\n1\n1\n1\n1\n1", output: "Total candy: 5" },
    ],
    fix: `houses = int(input())
total = 0
for house in range(houses):
    candy = int(input())
    total = total + candy
print("Total candy:", total)`,
    why: "total = 0 is inside the loop, so the count resets at every house. Start it at 0 once, before the loop.",
    hint: "The answer is always just the last house’s candy. What happens to total each time the loop starts over?",
  },
  {
    name: "scariest costume",
    level: "hard",
    task: "The first line is how many costumes, then each costume’s name and scream score on their own lines. Print the costume with the highest score; on a tie, the first one wins.",
    code: `count = int(input())
best_name = input()
best_score = input()
for i in range(count - 1):
    name = input()
    score = input()
    if score > best_score:
        best_name = name
        best_score = score
print("Scariest costume:", best_name, "with", best_score, "screams")`,
    tests: [
      { input: "3\nGhost\n7\nWitch\n12\nVampire\n9", output: "Scariest costume: Witch with 12 screams", show: true },
      { input: "2\nZombie\n9\nMummy\n12", output: "Scariest costume: Mummy with 12 screams" },
      { input: "3\nBat\n25\nSkeleton\n100\nClown\n8", output: "Scariest costume: Skeleton with 100 screams" },
      { input: "2\nWerewolf\n5\nBanshee\n5", output: "Scariest costume: Werewolf with 5 screams" },
      { input: "1\nPumpkin\n3", output: "Scariest costume: Pumpkin with 3 screams" },
    ],
    fix: `count = int(input())
best_name = input()
best_score = input()
for i in range(count - 1):
    name = input()
    score = input()
    if int(score) > int(best_score):
        best_name = name
        best_score = score
print("Scariest costume:", best_name, "with", best_score, "screams")`,
    why: 'The scores are text, and text compares character by character, so "9" beats "12". Compare them as numbers with int().',
    hint: 'In Python, "9" > "12" is True. Why would that be?',
  },
  {
    name: "voting countdown",
    level: "easy",
    task: "Read a name and an age. Print that they can vote if they’re 18 or older; otherwise print how many years they have to wait.",
    code: `name = input()
age = int(input())
if age >= 18:
    print(name, "can vote!")
else:
    years_left = 18 - age
    print("Years until", name, "can vote:", yaers_left)`,
    tests: [
      { input: "Ada\n20", output: "Ada can vote!", show: true },
      { input: "Linus\n15", output: "Years until Linus can vote: 3", show: true },
      { input: "Grace\n18", output: "Grace can vote!" },
      { input: "Alan\n17", output: "Years until Alan can vote: 1" },
      { input: "Margaret\n10", output: "Years until Margaret can vote: 8" },
    ],
    fix: `name = input()
age = int(input())
if age >= 18:
    print(name, "can vote!")
else:
    years_left = 18 - age
    print("Years until", name, "can vote:", years_left)`,
    why: "yaers_left is a typo, and Python has never heard of a variable with that name. Spell it years_left.",
    hint: "Read the NameError carefully, letter by letter.",
  },
  {
    name: "goal average",
    level: "medium",
    task: "The first line is how many games a team played, then one line per game with its goals. Print the exact average goals per game, decimals included.",
    code: `games = int(input())
goals = 0
for game in range(games):
    goals = goals + int(input())
average = goals // games
print("Average goals per game:", average)`,
    tests: [
      { input: "4\n1\n2\n0\n2", output: "Average goals per game: 1.25", show: true },
      { input: "2\n3\n4", output: "Average goals per game: 3.5" },
      { input: "3\n2\n2\n2", output: "Average goals per game: 2.0" },
      { input: "8\n1\n0\n0\n0\n0\n0\n0\n0", output: "Average goals per game: 0.125" },
      { input: "1\n5", output: "Average goals per game: 5.0" },
    ],
    fix: `games = int(input())
goals = 0
for game in range(games):
    goals = goals + int(input())
average = goals / games
print("Average goals per game:", average)`,
    why: "// is floor division: it chops off the decimals. A single / keeps them.",
    hint: "The total is right but the decimals vanish. Look closely at how the division is written.",
  },
  {
    name: "last in line",
    level: "medium",
    task: "The first line is how many people are in line, then one name per line. Print who’s first and who’s last.",
    code: `count = int(input())
names = []
for i in range(count):
    names.append(input())
print("First in line:", names[0])
print("Last in line:", names[count])`,
    tests: [
      { input: "3\nAda\nGrace\nLinus", output: "First in line: Ada\nLast in line: Linus", show: true },
      { input: "1\nAlan", output: "First in line: Alan\nLast in line: Alan" },
      { input: "5\nKen\nBarbara\nDennis\nFrances\nTim", output: "First in line: Ken\nLast in line: Tim" },
      { input: "2\nMargaret\nKatherine", output: "First in line: Margaret\nLast in line: Katherine" },
    ],
    fix: `count = int(input())
names = []
for i in range(count):
    names.append(input())
print("First in line:", names[0])
print("Last in line:", names[count - 1])`,
    why: "Lists start counting at 0, so a list of 3 names ends at index 2. The last name is names[count - 1] (or names[-1]).",
    hint: "The first name is at index 0. If there are 3 names, what index is the last one?",
  },
  {
    name: "split the bill",
    level: "medium",
    task: "Read the bill total (it can have cents) and how many people are splitting it. Add a 20% tip, then print the tip and each person’s share, rounded to the cent.",
    code: `total = int(input())
people = int(input())
tip = total * 0.2
share = (total + tip) / people
print("Tip:", round(tip, 2))
print("Each person pays:", round(share, 2))`,
    tests: [
      { input: "24.50\n2", output: "Tip: 4.9\nEach person pays: 14.7", show: true },
      { input: "30\n4", output: "Tip: 6.0\nEach person pays: 9.0" },
      { input: "10.99\n1", output: "Tip: 2.2\nEach person pays: 13.19" },
      { input: "100\n3", output: "Tip: 20.0\nEach person pays: 40.0" },
      { input: "7.25\n5", output: "Tip: 1.45\nEach person pays: 1.74" },
    ],
    fix: `total = float(input())
people = int(input())
tip = total * 0.2
share = (total + tip) / people
print("Tip:", round(tip, 2))
print("Each person pays:", round(share, 2))`,
    why: 'int() only understands whole numbers, so "24.50" is a ValueError. Money with cents needs float().',
    hint: "Read the ValueError: what text did int() choke on, and what kind of number is it?",
  },
  {
    name: "winning streak",
    level: "hard",
    task: "Read a team’s results as one line of letters (W = win, L = loss, D = draw) and print their longest run of wins in a row.",
    code: `results = input()
best = 0
streak = 0
for result in results:
    if result == "W":
        streak = streak + 1
    else:
        if streak > best:
            best = streak
        streak = 0
print("Longest winning streak:", best)`,
    tests: [
      { input: "WLWWLWWW", output: "Longest winning streak: 3", show: true },
      { input: "WWWLW", output: "Longest winning streak: 3" },
      { input: "WWWW", output: "Longest winning streak: 4" },
      { input: "DWLWW", output: "Longest winning streak: 2" },
      { input: "WWDWW", output: "Longest winning streak: 2" },
      { input: "LLD", output: "Longest winning streak: 0" },
    ],
    fix: `results = input()
best = 0
streak = 0
for result in results:
    if result == "W":
        streak = streak + 1
    else:
        if streak > best:
            best = streak
        streak = 0
if streak > best:
    best = streak
print("Longest winning streak:", best)`,
    why: "The streak only gets checked when a win run ends with an L or D, so a run still going at the end of the line is never counted. Check once more after the loop.",
    hint: "Try a team that wins its last few games. When does the code compare streak to best?",
  },
  {
    name: "the optional signature",
    level: "medium",
    spooky: true,
    task: "Read a viewer ID, then an auth key (it may be blank). Log in only if the key is the right signature for that ID.",
    code: `import hashlib

SECRET = "pumpkin"

viewer_id = input()
auth_key = input()

ok = True
# Verify signature, if present
if auth_key:
    signed = f"app_{viewer_id}_{SECRET}"
    check_key = hashlib.md5(signed.encode()).hexdigest()
    if check_key != auth_key:
        ok = False

if ok:
    print("Logged in as", viewer_id)
else:
    print("VK.com authentication failed: invalid auth key")`,
    tests: [
      { input: "42\n6807382ee13fa65303f2d156ac7b2405", output: "Logged in as 42", show: true },
      { input: "42\nnot-a-real-key", output: "VK.com authentication failed: invalid auth key" },
      { input: "7\n\n", output: "VK.com authentication failed: invalid auth key" },
      { input: "13\n6807382ee13fa65303f2d156ac7b2405", output: "VK.com authentication failed: invalid auth key" },
      { input: "7\n2a77c6e9222687704dee5785325c05c4", output: "Logged in as 7" },
    ],
    fix: `import hashlib

SECRET = "pumpkin"

viewer_id = input()
auth_key = input()

ok = True
# Verify signature, always
signed = f"app_{viewer_id}_{SECRET}"
check_key = hashlib.md5(signed.encode()).hexdigest()
if check_key != auth_key:
    ok = False

if ok:
    print("Logged in as", viewer_id)
else:
    print("VK.com authentication failed: invalid auth key")`,
    why: "The vk-app backend checked the signature only when auth_key was present. Omitting it could let attackers impersonate a VK user. The fix requires a valid signature before trusting the viewer ID.",
    hint: "Every example passes. What happens when the auth key line is blank?",
    source: {
      project: "python-social-auth",
      blurb: "the login library behind social-auth-app-django",
      cve: "CVE-2026-57178",
      url: "https://github.com/advisories/GHSA-3c93-f73f-qc9h",
      published: "2026-09-24",
      severity: "High (7.4)",
      commit: "https://github.com/python-social-auth/social-core/commit/1bfacdd0379e5eb46e169a99ab648b835e9bb6a2",
      realFix: "Checks the signature every time, not only “if present.”",
    },
  },
];
