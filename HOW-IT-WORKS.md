# How LabelLens works

A walkthrough so you can explain every part of it.

## 1. The big picture

```
 photo ──▶ Tesseract.js (on device) ─┐
 typed / pasted text ────────────────┼──▶ label text ──▶ the user checks it
 sample label ───────────────────────┘                        │
                                                              ▼
                                        parseLabel(): split into lines and sentences
                                                              │
                         ┌────────────────────────────────────┼────────────────────────┐
                         ▼                                    ▼                        ▼
                 medicine name line                 instruction sentences      warning sentences
                                                              │                        │
                                                 parseInstruction(): fields      WARN_RULES → keys
                                                 dose · unit · how often ·
                                                 times · food · max · duration
                                                              │
                                     unsafe? ── yes ──▶ "ask your pharmacist" (refused)
                                                              │ no
                                                              ▼
                                  render(): every field rebuilt from the phrase library
                                  for the chosen language → schedule, lines, audio, quiz
```

## 2. File tour

| Path | Job |
|---|---|
| `index.html` | The whole app: layout, phrase library, parser, rendering, photo reading |
| `samples/` | Six fictional labels, each as a clean image and a photo-like image |
| `tests/run-tests.mjs` + `expected.json` | 31 parser cases, run in a real browser |
| `tests/ui-tests.mjs` | 17 interface, safety and security checks |
| `.github/workflows/ci.yml` | Runs the tests, then deploys to GitHub Pages |

## 3. Key ideas

### Why not translate sentences?
A translation model is asked to invent new text every time, and in medicine one wrong word ("twice" becoming "two tablets") can hurt someone. LabelLens only ever *chooses* from sentences written in advance. The risky step, understanding the English, is done by a small, testable parser, and the output is assembled from checked pieces.

### The parser (`parseLabel` and `parseInstruction`)
- **Clean up text recognition mistakes:** `|` becomes `I`, and an `o` next to a digit becomes `0`.
- **Skip the paperwork:** lines like "Patient:", "Qty:" or "Pharmacy" are ignored. The first line containing a strength (mg, mcg, mL, %) without an instruction verb is taken as the medicine name.
- **Re-join broken lines:** cameras and printers split sentences, so lines are joined back together when they clearly continue.
- **Eat the sentence piece by piece:** each regular expression that matches removes its words (the `eat()` helper). Any meaningful words left over at the end mean the app didn't understand something, so it shows that part in English with "ask your pharmacist".

### Refusal is a feature
`UNSAFE` lists patterns the app must never try to simplify: "then" (a change of dose), weekly or named-day schedules, "as directed", tapering, units (insulin) and sliding scales. Any digit left over, a missing dose or a missing frequency also makes a label unsafe. Doses above 4 units, more than 6 times a day, or intervals outside 2–24 hours are flagged as unusual.

### The phrase library
Persian, Arabic, Mandarin and Vietnamese have hand-written grammar functions. Arabic needs them because its nouns change form for one, two, and three to ten. The other ten languages use templates such as `"{n} {u}"` with a singular and plural unit word, so adding a language is data, not code.

### Teach-back
Pharmacists check understanding by asking the patient to repeat the instructions back. The check question does the same: "How much do you take each time?", with the right answer and two plausible wrong ones.

## 4. Glossary

| Term | Plain version |
|---|---|
| OCR | Optical character recognition: reading text from a photo |
| PRN | "When required": take only if needed |
| Teach-back | Asking the patient to explain the instructions back, to check understanding |
| RTL | Right-to-left scripts such as Arabic, Persian and Urdu |
| CSP | Content-Security-Policy: rules telling the browser what a page may load or run |

## 5. Interview questions you might get

**Q: Why not just call a translation API or a large language model?**
A: Because they generate new text, and they make the most mistakes in exactly the languages Western Sydney speaks. One study found Google Translate 67.5% accurate in Farsi on discharge instructions. Restricting output to pre-written, reviewable phrases makes every possible output checkable in advance, and refusing everything else keeps the risky cases with the pharmacist.

**Q: How do you test something whose input is a photo?**
A: I separated reading from understanding. The 12 sample photos were run through text recognition once, and that output (including its mistakes) is stored as test cases. The parser tests then run in a real browser against those, so they are fast and repeatable. They show that recognition errors either still parse correctly or are refused.

**Q: What would you need before real patients used this?**
A: Native-speaker review of every phrase, recorded audio, a usability study with patients and pharmacists, and probably a regulatory assessment, because software that gives dosing instructions can count as a medical device.

## 6. Ideas to extend it

1. **Pharmacist mode:** the pharmacist prints the translated sheet at the counter, so the patient doesn't need a phone.
2. **Recorded audio** by native speakers, replacing the device's synthetic voice.
3. **More patterns:** weekly medicines are refused today; a careful, tested pattern for them would help many patients.
