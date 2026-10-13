import { expect, test } from "bun:test";
import { isHfcEmail } from "./season";

test("isHfcEmail takes HawkMail and staff emails only", () => {
  expect(isHfcEmail("jsmith@hawkmail.hfcc.edu")).toBe(true);
  expect(isHfcEmail(" JSmith@HawkMail.HFCC.edu ")).toBe(true);
  expect(isHfcEmail("advisor@hfcc.edu")).toBe(true);
  expect(isHfcEmail("jsmith@gmail.com")).toBe(false);
  expect(isHfcEmail("jsmith@hfcc.edu.evil.com")).toBe(false);
  expect(isHfcEmail("jsmith@nothfcc.edu")).toBe(false);
});
