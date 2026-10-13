import { describe, expect, test } from "bun:test";
import { cleanIdea, ideasText } from "./ideas";

describe("ideas", () => {
  test("cleaning trims, squeezes blank lines, and leaves nothing for whitespace", () => {
    expect(cleanIdea("  more game nights \n")).toBe("more game nights");
    expect(cleanIdea("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
    expect(cleanIdea(" \n\t ")).toBe("");
  });

  test("copy all lists each idea with the name and date", () => {
    const oct14 = Date.UTC(2026, 9, 14, 22);
    expect(
      ideasText([
        { name: "Sam", createdAt: oct14, text: "A hackathon" },
        { name: "Alex", createdAt: oct14, text: "Game dev" },
      ]),
    ).toBe("Sam, Oct 14: A hackathon\n\nAlex, Oct 14: Game dev");
  });
});
