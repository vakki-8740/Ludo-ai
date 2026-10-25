# Ludo-s

Ludo Board — 4 colour (Green, Yellow, Red, Blue) ka single-file web game with a
strategy engine that reads its move priorities from `satatgy.txt`.

## Files

| File | Kaam |
|---|---|
| `ludo-board.html` | Board, match setup, token locations, dice, Next Move |
| `game.js` | Rules engine + strategy chooser |
| `satatgy.txt` | Strategy file — priorities yahin se read hoti hain |
| `token/tokens.html` | Pawn token ka source SVG |
| `win-icons/win.png` | Home triangle pe aata hai |
| `dies/dice.html` | Dice faces ka reference |

## Run

Project ko local server se chalana zaroori hai (file `fetch` + `localStorage`
ki wajah se):

```sh
cd ludo-s
python3 -m http.server 8080
```

Phir browser me kholo: `http://localhost:8080/ludo-board.html`

## How to play

1. **Create Match** → board khulta hai
2. Setup popup: **1 v 1** ya **2 v 2**, aur apna colour chuno
   - 1v1 opponent auto: Green→Blue, Red→Yellow, Yellow→Red, Blue→Green
   - 2v2 teams diagonals: Green+Blue vs Red+Yellow
3. Board par har visible token ki location set karo
   (**Base / Start box / Track box 1-52 / Home path / Finished**)
   aur **Confirm Positions** dabao
4. **Player A (Own)** panel me dice 1-6 select karo
5. **Next Move** dabao — strategy engine best move suggest karegi
   (sirf suggestion, khud execute nahi karti)

## Strategy engine

`game.js` koi rule khud nahi banata. Wo `satatgy.txt` ko run time par padhta hai:

```
Winning Move > Save Token > Capture Opponent > Finish Token >
Reach Safe Square > Create Winning Position > Develop New Tokens > Best Progress
```

Moves usi order me **lexicographic** compare hote hain. Agar file missing ho ya
usme koi naya rule aaye jo implement na ho, to analysis **error dikhata hai** —
koi guess kiya hua move nahi.

## Rules model

- Progress `0-5` → Base, sirf dice **6** par bahar
- Progress `6-56` → ring ke 51 track boxes
- Progress `57-61` → home path ke 5 boxes
- Progress `62` → **Finished** (home triangle)
- Ring numbers 1-52, lanes 53-72, safe squares 9/22/35/48

## History

Har strategy analysis `localStorage` me `ludo_matches` key ke under save hota hai
(date/time, mode, colours, dice, board state, suggestion, reason).
Match History ka page ab nahi hai (home page hata diya gaya hai); data abhi bhi `localStorage` mein save hota hai.