import { describe, expect, it } from "vitest"

import { rackMix, type MixPhone } from "./rack-mix"

function phone(patch: Partial<MixPhone>): MixPhone {
  return { kind: "android", model: "Pixel 8a", androidVersion: "16", connection: "sim", carrier: "Mint Mobile", proxyName: "", ...patch }
}

describe("the rack mix (part 27)", () => {
  it("names the model most phones share and how many share it", () => {
    const mix = rackMix([
      phone({}),
      phone({ carrier: "T-Mobile" }),
      phone({ carrier: "Visible", androidVersion: "15" }),
      phone({ model: "Galaxy A15", carrier: "US Mobile", androidVersion: "14" }),
    ])
    expect(mix.warnings.map((warning) => warning.text)).toEqual([
      "4 of 4 phones are an Android. Over half the rack sharing one kind looks like a farm; the next phone should be different.",
      "3 of 4 phones are a Pixel 8a. Over half the rack sharing one model looks like a farm; the next phone should be different.",
    ])
    expect(mix.counts.model).toEqual([
      { value: "Pixel 8a", count: 3, known: true },
      { value: "Galaxy A15", count: 1, known: true },
    ])
  })

  it("names a system version most phones run, and an iPhone's as iOS", () => {
    const mix = rackMix([
      phone({ model: "A", kind: "iphone", androidVersion: "17.6" }),
      phone({ model: "B" }),
      phone({ model: "C" }),
      phone({ model: "D" }),
    ])
    expect(mix.warnings.map((warning) => [warning.kind, warning.count, warning.total])).toEqual([
      ["kind", 3, 4],
      ["carrier", 4, 4],
      ["android", 3, 4],
    ])
    expect(mix.warnings[2].text).toContain("3 of 4 phones run Android 16. Over half the rack sharing one system version")
    expect(mix.counts.android).toEqual([
      { value: "Android 16", count: 3, known: true },
      { value: "iOS 17.6", count: 1, known: true },
    ])
    expect(mix.counts.kind).toEqual([
      { value: "Android", count: 3, known: true },
      { value: "iPhone", count: 1, known: true },
    ])
  })

  it("never warns on a rack of fewer than four phones", () => {
    expect(rackMix([phone({}), phone({}), phone({})]).warnings).toEqual([])
  })

  it("warns only past half: two of four is not more than half", () => {
    const mix = rackMix([
      phone({ carrier: "A" }),
      phone({ carrier: "B" }),
      phone({ model: "Galaxy A15", carrier: "C", androidVersion: "15", kind: "iphone" }),
      phone({ model: "Moto G", carrier: "D", androidVersion: "14", kind: "iphone" }),
    ])
    expect(mix.warnings).toEqual([])
  })

  it("counts carriers without case, Wi-Fi phones by their proxy, and never warns about what was not read", () => {
    const mix = rackMix([
      phone({ model: "", carrier: "t-mobile" }),
      phone({ model: "", carrier: "T-Mobile", androidVersion: "15" }),
      phone({ model: "", connection: "wifi", proxyName: "US home line", androidVersion: "17.6", kind: "iphone" }),
      phone({ model: "Moto G", carrier: "", androidVersion: "18.0", kind: "iphone" }),
    ])
    expect(mix.counts.carrier).toEqual([
      { value: "t-mobile", count: 2, known: true },
      { value: "Carrier not known", count: 1, known: false },
      { value: "Wi-Fi through US home line", count: 1, known: true },
    ])
    expect(mix.counts.model[0]).toEqual({ value: "Model not read", count: 3, known: false })
    expect(mix.warnings).toEqual([])
  })
})
