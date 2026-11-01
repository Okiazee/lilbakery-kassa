# lil'bakery Kassa

Kassa för försäljning av bakverk och dryck på popup. Fungerar på iPad, Android
och dator, i webbläsaren eller installerad som app på hemskärmen. Betalning med
Swish och kontanter. All data sparas lokalt på enheten.

## Filer

```
kassa/
  index.html              Hela appen (gränssnitt och logik)
  rabatt.js               Rabattkoder: skapa, kontrollera och räkna användning
  bestallning.js          Beställningar: status, agenda, månadskalender, kalenderfil och meddelanden
  tests/                  Tester för rabatt.js, bestallning.js och Google-skriptet (node --test tests/*.test.mjs)
  manifest.webmanifest    Gör att appen kan installeras på hemskärmen
  sw.js                   Service worker: appen fungerar utan internet
  icons/                  Appikoner
  img/                    Logga, muffins och ordmärke
  vendor/jszip.min.js     Läser Word-filer (.docx) vid produktimport
  vendor/qrcode.min.js    Skapar Swish-QR-koden
  Produktlista-mall.docx  Word-mall för produktimport
  serve.bat               Startar kassan på datorn för test i det lokala nätverket
```

## Så kommer du igång

1. **Testa på datorn.** Dubbelklicka på `serve.bat` (kräver att `.venv` finns i
   projektmappen, annars Python på datorn). Kassan öppnas på
   <http://localhost:8765/>. Adressen som visas i fönstret går att öppna på
   iPad och telefon i samma wifi.

2. **Publicera på en riktig adress** (rekommenderat för daglig användning).
   Enklast är GitHub Pages, som är gratis och ger https, vilket krävs för att
   appen ska fungera offline och kunna installeras på hemskärmen:
   - Skapa ett konto på <https://github.com> om du inte har ett.
   - Skapa ett nytt repository, till exempel `lilbakery-kassa`.
   - Ladda upp innehållet i mappen `kassa/` (alla filer och undermappar).
   - Gå till *Settings → Pages*, välj *Deploy from a branch*, gren `main`,
     mapp `/ (root)`, och spara.
   - Efter någon minut finns kassan på
     `https://<ditt-användarnamn>.github.io/lilbakery-kassa/`.

3. **Installera på enheterna.**
   - iPad och iPhone: öppna adressen i Safari, tryck på Dela och välj
     *Lägg till på hemskärmen*.
   - Android: öppna i Chrome, tryck på menyn (tre prickar) och välj
     *Installera app*.
   - Dator: klicka på installationsikonen i adressfältet i Chrome eller Edge.

4. **Lägg in dina uppgifter** under *Inställningar*: företagsnamn,
   organisationsnummer, Swish-nummer och växelkassa.

5. **Importera produkterna** under *Produkter → Importera från fil*. Utgå gärna
   från `Produktlista-mall.docx`.

## Kategoribilder

Varje kategori kan ha en bild som visas på produktplattorna och i
kategoriknapparna i kassan. Under *Produkter → Ändra* på kategorin väljer du
antingen en av de inbyggda tecknade bilderna i loggans stil (cookie, cupcake,
brownie, tårta, bulle, kaffe, kall dryck med flera) eller *Egen bild* för att
ta ett foto eller välja ur bildbiblioteket. Foton sparas i liten storlek i
appen. Nya kategorier får automatiskt en passande bild utifrån namnet.

## Produktimport från Word

Kassan läser en `.docx`-fil på två sätt:

- **Tabell** med kolumnerna *Kategori*, *Produkt*, *Pris* och valfritt *Moms*.
  Rubrikraden ska vara kvar. Tom kategori-cell betyder samma kategori som raden
  ovanför.
- **Lista** utan tabell: en rad med kategorinamnet, sedan en rad per produkt
  med priset sist på raden, till exempel `Chocolate chip 35`.

CSV-filer och vanliga textfiler fungerar på samma sätt, och listan kan även
klistras in direkt i importrutan.

## Data och säkerhetskopior

Kvitton, dagsavslut, produkter och inställningar ligger i webbläsarens lagring
på den enhet som används. Ingenting skickas någon annanstans. Därför:

- Ta en **säkerhetskopia** (Inställningar → Spara säkerhetskopia) efter varje
  försäljningsdag och spara filen på datorn eller i molnet.
- Använd **Dagsavslut → Export** för CSV-filer till bokföringen.
- Installera appen på hemskärmen på iPad. Då rensar inte Safari lagringen
  efter en tids inaktivitet, vilket kan hända för vanliga webbsidor.

## Automatisk kopia till Google Drive

Under *Inställningar → Google Drive* kan kassan skicka en kopia till din Drive
efter varje köp och dagsavslut. Det sker via ett litet Apps Script-skript i ditt
eget Google-konto, inga tredjepartstjänster:

1. Öppna <https://script.google.com> på datorn och skapa ett nytt projekt.
2. Klistra in skriptet som visas i appen (knappen *Kopiera skriptet*). Nyckeln
   är redan ifylld.
3. Distribuera → Ny distribution → Webbapp, *Kör som: Jag*, *Vem har åtkomst:
   Alla*. Godkänn åtkomsten (Avancerat → Fortsätt → Tillåt).
4. Klistra in webbappens adress i appen och tryck *Testa anslutningen*.

Kopiorna hamnar i mappen *lil'bakery Kassa* på Drive: `kassa-backup-senaste.json`,
en fil per dag och dagsavsluten som CSV. *Hämta senaste kopian* läser tillbaka
kopian till en annan enhet.

## Kvitton som PDF och e-post

Öppna ett kvitto under *Kvitton*, eller tryck *Mejla kvitto* direkt efter köpet.

- **Ladda ner** skapar kvittot som ett PDF-dokument i A5 med logga, säljaruppgifter, artikeltabell, moms och betalning.
  På iPad öppnas delningsmenyn med Spara i Filer, Mail, AirDrop och Skriv ut.
  På datorn laddas filen ner.
- **Ladda ner PDF** i kvittolistan samlar dagens kvitton, eller alla kvitton,
  i en PDF med ett kvitto per sida.
- **Mejla** skickar kvittot till kundens e-postadress. Med Google-skriptet
  version 2 eller senare skickas mejlet direkt från ditt Google-konto med PDF:en som bilaga.
  Utan det skapar *Öppna i Mail* ett mejl med kvittot i enhetens e-postapp.

För att kunna skicka direkt behöver skriptet i Google uppdateras en gång.
Kopiera den nya koden under *Inställningar → Google Drive*, ersätt koden i
script.google.com och spara. Välj sedan Distribuera → Hantera distributioner →
pennan → Version: Ny version → Distribuera, och godkänn att skriptet får
skicka e-post. Adressen är densamma som förut.

## Rabattkoder

Under *Produkter → Rabattkoder* skapar du koder: egen text som FIKA25 eller en
slumpad kod, procent eller kronor, valfria datum och max antal gånger. I kassan
finns aktiva koder som knappar i rabattdialogen, och koden kan också skrivas in.
En kod ersätter en egen rabatt och tvärtom, de läggs inte ihop.

Hur ofta en kod använts, hur mycket rabatt den gett och när räknas fram ur
kvittona. Därför räknas makulerade köp inte, och en återställd kopia blir rätt.
Öppna beställningar med koden visas som reserverade och räknas mot max antal.
Dagsavslutet visar rabatt per kod. En kod som nått sitt max visas som *Förbrukad*.

## Beställningar

Fliken *Beställningar* ersätter Förbeställningar. Gamla förbeställningar finns
kvar med samma nummer, som B1, B2 och så vidare.

- **Ny beställning** skapas direkt i fliken, med produkter från listan och egna
  rader med pris, till exempel en tårta. Från kassan sparas ett pågående köp med
  *Spara som beställning*.
- Status: Ny, Bekräftad, Utlämnad och Avbokad. Betalning: i kassan eller
  faktureras. En ny beställning får sakna pris, men inte en bekräftad.
- **Bekräfta** öppnar bekräftelsetexten. Den kan kopieras, delas eller mejlas, och
  beställningen blir då bekräftad. Under *Meddelande* finns också en påminnelse.
  Texterna ändras under Inställningar.
- **Kalender** visar månaden med antal beställningar per dag. Tryck på en dag för
  att se dess beställningar. Varje beställning kan läggas i Google Kalender eller
  sparas som kalenderfil (.ics), men enklast är den automatiska synken nedan.
- **Spara som bild** i meddelandet skapar bekräftelsen eller påminnelsen som en
  PNG i samma utformning som kvittot, att skicka i sms, Messenger eller Instagram.
- **Intern anteckning** syns bara för dig. Adresser som `https://…` och `www.…`
  blir klickbara, och *+ Länk* lägger in en länk med egen text, till exempel
  en bild på tårtan.
- **Swish** och **Kontant** på kortet lägger beställningen i kassan och tar betalt.
  Kvittot märks med beställningen. Makuleras kvittot blir beställningen obetald
  igen.

Beställningarna sparas på enheten, liksom kvittona. Hantera dem på den enhet där
du har kassan. *Hämta senaste kopian* ersätter allt på enheten och varnar om
enheten har nyare ändringar.

## Beställningar i Google Kalender

Under *Inställningar → Google Kalender* kan kassan lägga alla beställningar med
datum i en egen kalender, som standard *lil'bakery beställningar*. Din vanliga
kalender rörs inte. Händelsen visar varor, belopp, telefon, önskemål och den
interna anteckningen, och flyttas eller tas bort när beställningen ändras.
Utlämnade beställningar får en bock i titeln och nya en markering
*(ej bekräftad)*. Beställningar äldre än 60 dagar skickas inte.

Synken går genom samma skript som Google Drive, version 4:

1. Kopiera skriptet under *Inställningar → Google Drive* och ersätt koden i
   script.google.com. Spara.
2. Välj funktionen `godkann` i verktygsraden och tryck *Kör*. Godkänn att
   skriptet får hantera kalendrar.
3. Distribuera → Hantera distributioner → pennan → Version: Ny version →
   Distribuera.
4. Bocka i *Synka beställningar till Google Kalender*.

Frågar Google inte om lov i steg 2: ta bort skriptets åtkomst på
<https://myaccount.google.com/connections> och kör `godkann` igen.

## Ny version

När filerna i mappen ändras: ändra `VERSION` i `sw.js` så att installerade
appar hämtar den nya versionen. Appen visar då en knapp för att ladda om.
