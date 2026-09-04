import { expect, test } from "bun:test";
import { isGmail, normalizeGmail } from "./gmail";

test("only gmail addresses pass", () => {
  expect(isGmail("a@gmail.com")).toBe(true);
  expect(isGmail("a@googlemail.com")).toBe(true);
  expect(isGmail("a@GMAIL.COM")).toBe(true);
  expect(isGmail("a@mailinator.com")).toBe(false);
  expect(isGmail("a@gmail.com.evil.co")).toBe(false);
  expect(isGmail("nope")).toBe(false);
  expect(isGmail("@gmail.com")).toBe(false);
});

test("dots and plus tags collapse to one address", () => {
  expect(normalizeGmail("F.o.O+bonk@gmail.com")).toBe("foo@gmail.com");
  expect(normalizeGmail("foo@googlemail.com")).toBe("foo@gmail.com");
  expect(normalizeGmail(" foo@gmail.com ")).toBe("foo@gmail.com");
  expect(normalizeGmail("foo@yahoo.com")).toBe(null);
  expect(normalizeGmail("+tag@gmail.com")).toBe(null);
});
