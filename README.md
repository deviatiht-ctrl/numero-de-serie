# AI INFLUENCE — Dashboard & Scanner Biyè Haute Sécurité (10 HTG)

Sistèm konplè pou jere ak valide **1 000 biyè papye** divize an **10 Lo (LOT 1 a LOT 10)** soti nan **AJ9128001** rive nan **AJ9129000**.
Sistèm nan itilize **Supabase** pou baz done an tan reyèl ak **Kamera Entelijan (OCR + Kòd-Bar)** pou kontwòl otomatik nan pòt antre a.

---

## 1. Distribisyon 1 000 Biyè yo pa Lo

Chak lo gen egzakteman **100 biyè** (Prix : 10 HTG / biyè) :

| Lo | Premye Nimewo | Dènye Nimewo | Kantite Biyè |
| :--- | :--- | :--- | :--- |
| **LOT 1** | `AJ9128001` | `AJ9128100` | 100 |
| **LOT 2** | `AJ9128101` | `AJ9128200` | 100 |
| **LOT 3** | `AJ9128201` | `AJ9128300` | 100 |
| **LOT 4** | `AJ9128301` | `AJ9128400` | 100 |
| **LOT 5** | `AJ9128401` | `AJ9128500` | 100 |
| **LOT 6** | `AJ9128501` | `AJ9128600` | 100 |
| **LOT 7** | `AJ9128601` | `AJ9128700` | 100 |
| **LOT 8** | `AJ9128701` | `AJ9128800` | 100 |
| **LOT 9** | `AJ9128801` | `AJ9128900` | 100 |
| **LOT 10** | `AJ9128901` | `AJ9129000` | 100 |
| **TOTAL** | **AJ9128001** | **AJ9129000** | **1 000 Biyè** |

---

## 2. Kijan pou Enjekte 1 000 Nimewo yo nan SQL (Supabase)

Tout 1 000 nimewo yo pare nan fichye [insert_lots.sql](file:///c:/Users/HACKER/Documents/IA%20INFLUENCE/insert_lots.sql) ak [schema.sql](file:///c:/Users/HACKER/Documents/IA%20INFLUENCE/schema.sql) :

1. Ale sou **[Supabase Dashboard](https://supabase.com)** nan pwojè w la.
2. Klike sou meni **SQL Editor** (a goch) -> **New query**.
3. Kopye tout sa ki nan [insert_lots.sql](file:///c:/Users/HACKER/Documents/IA%20INFLUENCE/insert_lots.sql) (oswa [schema.sql](file:///c:/Users/HACKER/Documents/IA%20INFLUENCE/schema.sql)).
4. Klike sou **Run**.
5. Nan 1 segonn sèlman, tout 1 000 biyè yo monte nan tab `public.aif_tickets` ak tout lo yo, estati `stock`, ak pri `10 HTG`.

---

## 3. Achitekti Sekirite Avanse (Anti-Fwod & Anti-Doublon)

Pou evite moun itilize menm biyè a 2 fwa oswa photocopie :

1. **Row-Level Locking (`FOR UPDATE`)** :
   Fonksyon SQL `aif_validate_ticket_scan` bloke liy biyè a pandan tranzaksyon an. Menm si 2 moun ta eseye pase menm biyè a nan 2 pòt diferan nan egzakteman menm milisegonn nan, se sèl premye moun nan ki ap jwenn aksè !
2. **Sik Lavi Biyè a** :
   - `stock` : Biyè enprime men li poko peye.
   - `sold` : Kliyan an fin peye 10 HTG, yo anrejistre vandè a ak dat la.
   - `used` : Biyè a fin analize nan pòt la, li make kòm itilize epi li pa ka pase ankò.

---

## 4. Scanner Kamera Entelijan nan Pòt la

Nou entegre yon sistèm vizyon pa òdinatè (Computer Vision) dirèkteman nan navigatè a :

- **Lektè OCR (Tesseract.js WebAssembly)** : Li dirèkteman tèks nimewo seri a (`AJ9128...`) ki enprime sou biyè papye a san ou pa bezwen tape anyen ak men w !
- **Lektè Kòd-Bar & QR Code (BarcodeDetector API)** : Si biyè a gen yon kòd-bar oswa QR, li li l nan mwens pase 50 milisegonn.
- **Kadrans Lazè (HUD Targeting Reticle)** : Yon kadrans santre ak animasyon lazè kote ou sèlman bezwen vize nimewo seri a.
- **Feedback Odyo & Haptik (Web Audio API)** :
  - 🔔 **BEEP Pozitif (Akò Majè)** + Koulè Vèt : **ENTRÉE AUTORISÉE**.
  - 🚨 **BUZZ Alam (160Hz)** + Vibrasyon + Koulè Wouj : **FAUX BILLET** oswa **DÉJÀ UTILISÉ**.
  - ⚠️ **Son Avètisman** + Koulè Jon : **BILLET JAMAIS VENDU** (biyè a nan stock men li pa t janm peye).
- **Zouti pou Ajan nan Pòt** : Bouton pou limen Flash/Torche nan fènwa, bouton pou chanje kamera (devan/dèyè), ak opsyon pou antre nimewo a alamen si biyè a ta chire.

---

## 5. Kijan pou Lanse Pwojè a

Nan tèminal la nan dosye sa a :
```powershell
npx serve .
```
Oswa ouvri dirèkteman fichye [index.html](file:///c:/Users/HACKER/Documents/IA%20INFLUENCE/index.html) nan navigatè Google Chrome / Edge / Safari ou.
