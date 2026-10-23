import { expect, test } from "bun:test";
import { CLUB, WEEK_STARTS, isHfcEmail, roomFor } from "./season";

test("isHfcEmail takes HawkMail and staff emails only", () => {
  expect(isHfcEmail("jsmith@hawkmail.hfcc.edu")).toBe(true);
  expect(isHfcEmail(" JSmith@HawkMail.HFCC.edu ")).toBe(true);
  expect(isHfcEmail("advisor@hfcc.edu")).toBe(true);
  expect(isHfcEmail("jsmith@gmail.com")).toBe(false);
  expect(isHfcEmail("jsmith@hfcc.edu.evil.com")).toBe(false);
  expect(isHfcEmail("jsmith@nothfcc.edu")).toBe(false);
});

test("roomFor moves only the Oct 21 and Oct 28 meetings to the Gaming Room", () => {
  expect(roomFor(new Date("2026-10-21T17:00:00-04:00"))).toBe("Gaming Room (E-180)");
  expect(roomFor(new Date("2026-10-28T17:00:00-04:00"))).toBe("Gaming Room (E-180)");
  expect(WEEK_STARTS.filter((d) => roomFor(d) !== CLUB.room)).toHaveLength(2);
});
