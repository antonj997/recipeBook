# Recipebook – produkt-, funktions- och designbeskrivning

Ursprunglig beskrivning 27 oktober 2026 (kodversion 61ebf72). Avsnitten hålls aktuella när beteendet ändras; se AGENTS.md.

Beskrivningen utgår från appens aktuella implementation, projektets produkt-, design-, import- och säkerhetsdokument samt besluten under utvecklingen. Dagens funktioner beskrivs först. Tidigare alternativ och sådant vi har valt bort sammanfattas särskilt i avsnitt 16. Äldre idéer ska därför inte läsas som funktioner som fortfarande finns i appen.

- Publik app: https://antonj997.github.io/recipeBook/
- Källkod: https://github.com/antonj997/recipeBook

## 1. Appens syfte

Recipebook är en personlig digital receptbok. Den hjälper användaren genom hela kedjan från att hitta ett recept till att planera inköp och laga maten.

Grundidén är att samla egna, redigerbara kopior av recept på ett ställe. Recept kan skrivas för hand eller importeras från en länk. Därefter kan användaren organisera dem i kategorier, ändra portionsantal, lägga ingredienser i en inköpslista och följa instruktionerna med avbockning och timers.

Appen är främst tänkt för ägaren och en liten krets vänner. Den ska vara enkel nog att använda spontant, men genomarbetad nog att kännas som en riktig produkt. Den är personlig snarare än social: varje konto har sin privata receptsamling och inköpslista. Vänner kan använda appen med egna konton, men det finns ingen gemensam publik receptbank, social feed eller automatisk delning mellan konton.

Recipebook ska fungera på telefon, surfplatta och dator. Telefonen är särskilt viktig under matlagning och i mataffären. Datorn är viktig för att redigera, organisera och läsa med större överblick. Appen kan installeras som en PWA och öppnas från hemskärmen som en separat app.

## 2. Problemet vi löser

Recept är ofta utspridda mellan olika webbplatser, bokmärken, anteckningar och skärmbilder. När det är dags att laga maten måste användaren leta upp rätt version igen. Originalwebbplatsen kan dessutom innehålla reklam, långa texter, störande gränssnitt eller innehåll som ändras och försvinner.

Recipebook löser flera delar av samma vardagsproblem:

- Samling: recept från olika källor får en gemensam plats och ett gemensamt format.
- Ägande och anpassning: användaren sparar sin egen kopia och kan ändra den utan att påverka originalet.
- Återfinning: sökning, kategorier och två biblioteksvyer gör det lättare att hitta ett recept man redan tycker om.
- Matlagning: tydliga steg, portionsskalning, timers och möjlighet att hålla skärmen vaken minskar behovet av att växla mellan flera appar.
- Inköp: valda ingredienser kan flyttas direkt till en privat inköpslista och grupperas efter vanliga butiksavdelningar.
- Tillgänglighet: sparade recept finns lokalt på enheten och kan användas utan ständig internetanslutning.
- Kontinuitet: kontosynk och säkerhetskopior minskar risken att recept går förlorade när man byter enhet eller loggar ut.

Målet är att minska friktion, inte att fylla appen med så många funktioner som möjligt. Det ska gå snabbt att hitta rätt, förstå vad som ska göras och fortsätta där man var.

## 3. Produktens grundprinciper

### 3.1 En personlig receptbok

Det finns en aktiv receptsamling för den inloggade användaren. Vi har valt bort ett gränssnitt där användaren måste växla mellan flera separata kokböcker. Kategorier är sättet att ordna innehållet inom samlingen.

### 3.2 Prova utan konto, koppla på konto när det behövs

Man kan skapa manuella recept, kategorier och inköpsposter utan att först skapa ett konto. De sparas då på enheten. Den publicerade appens länkimport kräver inloggning, eftersom importen använder en skyddad serverfunktion.

### 3.3 Spara först när användaren har granskat

Nya och importerade recept passerar en förhandsgranskning. En import ska inte bli ett permanent sparat recept bara för att hämtningen lyckas.

### 3.4 Bevara arbetet

Utloggning ska inte tömma receptsamlingen eller kasta osynkade ändringar. Osparade ändringar ska skyddas av tydliga frågor när man är på väg att lämna dem. Vanliga borttagningar ska där det är lämpligt kunna ångras.

### 3.5 Rörelse ska förklara sambandet

När ett kort öppnas ska det kännas som att just det receptet växer till en sida. Animationen ska hjälpa orienteringen och kännas tillfredsställande, men navigationen ska fungera även när animationen avbryts eller inte stöds.

### 3.6 Samma funktion ska kännas likadan överallt

Menyer, portionsväljare, kryssrutor, ångra, återkoppling och redigeringsrader återanvänds. Skillnader mellan mobil och dator ska bero på skärmens utrymme och inmatningssätt, inte på att två olika designsystem har vuxit fram.

## 4. Appens struktur och navigation

De huvudsakliga sidorna är:

1. Hem / receptbiblioteket, med kortkarusell eller listvy.
2. Receptsidan, med bild, sammanfattning, ingredienser och instruktioner.
3. Lägg till / redigera recept.
4. Importera recept från länk.
5. Förhandsgranska ett nytt recept.
6. Hantera kategorier.
7. Inköpslistan.
8. Inställningar, där konto och lösenordsåterställning också finns.

Fokusläget är en särskild matlagningsvy som öppnas ovanpå receptsidan. Ingrediensväljaren till inköpslistan, snabbmenyer och bekräftelser är dialoger eller överlägg snarare än egna huvudsidor.

Den gemensamma headern innehåller boklogotypen och namnet Recipebook till vänster. Till höger finns en inköpskorg och inställningsikonen. Logotypen fungerar som väg hem. Under redigering och granskning döljs de vanliga headergenvägarna för att hålla fokus på uppgiften och skydda osparat arbete.

Gränssnittet använder för närvarande främst engelska funktionsnamn, även om recept, kategorier och inköpsprodukter kan vara svenska. Exempelvis heter knapparna Ingredients, Instructions, Focus mode och Add to shopping list.

## 5. Hemsidan och receptbiblioteket

### 5.1 Sökning och översta verktygsraden

Hemsidan ska ge snabb åtkomst till recepten. Sökfältet och Add recipe ligger på samma rad. Sökfältet sträcker sig hela vägen fram till knappen och använder en tunn grön underlinje i stället för ett tungt omgivande fält.

Sökningen söker i receptnamn och ingredienstext. Flera sökord kombineras så att alla orden behöver finnas någonstans i det sökbara innehållet. Det gör det möjligt att leta både efter en maträtt och efter recept med vissa råvaror. Sökfältets kryss rensar sökningen utan att flytta omkring layouten.

På små skärmar kan Add recipe komprimeras till sin ikon när sökningen får fokus, så att mer utrymme lämnas till textinmatningen.

Under verktygsraden finns kategoriväljaren, antalet matchande recept och en enda knapp för att byta mellan kort- och listvy. Knappens ikon visar den vy man kan växla till. Det finns inte längre två separata vyknappar.

Kategoriväljaren kan visa alla recept eller en vald kategori. Därifrån nås också kategorihanteringen. Recepten hämtas i namnordning. Vi har inte lagt till en separat uppsättning sorteringsreglage.

Avståndet mellan sökverktygen och bibliotekets rubrikrad ska vara samma i båda vyerna. En onödig skiljelinje mellan sök och karusell har tagits bort. Länken My recipes behövs inte på en sida som redan är receptbiblioteket.

### 5.2 Kortkarusellen

Kortvyn är det mest uttrycksfulla sättet att bläddra i samlingen. Recepten visas som stående kort med en stor matbild och en nedre yta i receptets färg.

Ett kort kan innehålla:

- Receptbild eller en matillustration om bild saknas.
- Receptets fullständiga titel så långt det tillgängliga utrymmet tillåter.
- En beskrivning i det utrymme som återstår.
- Upp till tre manuellt skapade kategorier.
- Total tillagningstid när uppgiften finns.
- Energi i kcal per portion när den uppgiften finns.

Titeln prioriteras framför beskrivningen. Beskrivningen reserverar inte ett fast antal rader som tvingar undan rubriken. Den fyller i stället återstående utrymme, klipps inom kortet och tonas ut nedtill om allt inte ryms. Kaloriuppgiften är per portion; den är inte en automatisk beräkning för hela receptet.

Kortet har en tunn kant i en mörkare ton av sin egen bakgrundsfärg. Bilden ligger kant i kant med kortets övre del. Kortens storlek och mellanrum anpassas efter skärmen. På mobil ska startsidan kännas luftig men samtidigt kompakt nog att inte kräva onödig vertikal scroll i normala skärmstorlekar. Mycket liten skärm eller förstorad text får däremot ge naturlig scroll i stället för avklippt innehåll.

Karusellen använder naturlig horisontell scroll med tydliga stopp per kort. Mjuka toningar vid skärmkanterna gör delvis synliga grannkort mindre abrupta. På mobil används svepning och indikatorn under korten. På större skärmar finns också diskreta navigationspilar och tangentbordsstöd.

Första och sista kortet ska kunna ligga centrerade i mobil- och tabletliknande bredder, även i liggande läge. På mycket breda skrivbordsskärmar används en mer hyllik vänsterjustering.

### 5.3 Karusellens indikator

Varje prick motsvarar exakt ett recept. Den relationen ska finnas kvar även med många recept, eftersom den annars gör dragningen svår att förstå.

När alla prickar inte får plats visas ett rörligt fönster av intilliggande prickar. Mindre markeringar vid kanterna visar att fler finns utanför. En liten positionsangivelse ger ytterligare orientering. Bara en begränsad mängd prickar behöver ritas samtidigt.

Man kan trycka på prickar eller dra längs indikatorn för att bläddra. När fingret hålls nära en kant kan bläddringen öka gradvis i hastighet. Den aktiva markeringen förändrar form med ett mjukt, flytande uttryck utan att tryckytorna hoppar.

### 5.4 Listvyn

Listvyn är den mer kompakta och skanningsbara motsvarigheten till karusellen. Den består av platta, lika höga rader med tunna avdelare, i samma anda som appens andra listor.

Till vänster finns en kvadratisk bild med rundade hörn. Bakom bildens högra sida sticker en smal remsa i receptets färg fram. Bild och färgremsa omges av en gemensam tunn, färgtonad kant. Saknas bild visas en matillustration.

Till höger visas en titel på högst två rader. Tre punkter läggs bara till när texten faktiskt inte ryms, inte bara för att titeln använder sin andra rad. Under titeln ligger en konsekvent metadatarad med klockikon, tid och upp till tre kategorinamn. Saknade uppgifter ändrar inte radernas grundformat.

Raderna är cirka 96 px höga och miniatyrerna cirka 72 px. Hela listan ska kännas lugn och sammanhängande. Vi har lämnat den tidigare varianten där varje rad var en helt färgfylld rektangel.

### 5.5 Lägg till direkt från biblioteket

Add recipe öppnar en meny med två val: skriva ett recept eller importera från en länk. Samma val går att nå via en extra platshållare sist i karusellen och en motsvarande rad sist i listan.

Karusellens platshållare är en prickad kontur där ett kort skulle kunna stå. Den ska kännas som en inbjudan att fylla på boken. Den räknas inte som ett recept och får ingen egen receptprick. Menyn förankras vid den kontroll som öppnade den. Den översta Add recipe-knappens pil ska därför inte ändras när platshållaren öppnar menyn.

### 5.6 Snabbmenyer och ihågkommen plats

Ett långt tryck på ett recept öppnar en snabbmeny. På dator fungerar högerklick; det finns också tangentbordsåtkomst. Menyn innehåller byt kategorier, redigera och ta bort, med passande ikoner.

Svepning ska inte misstolkas som ett knapptryck eller långt tryck. Kortens tryckåterkoppling är därför skyddad mot drag- och scrollgester. När snabbmenyn öppnats ska den inte försvinna bara för att användaren släpper fingret.

Sökning, kategori, vald vy, valt karusellkort och startsidans scrollposition sparas lokalt för aktuell användare eller enhetsläge. När man går tillbaka från ett recept återfår man sin plats. Byte mellan kort och lista ska inte i sig orsaka ett hopp nedåt på sidan.

När telefonen vrids från liggande till stående i kortvyn återställs en olämplig vertikal förskjutning efter att layouten har hunnit anpassas. Det valda receptet behålls.

### 5.7 Tomma och filtrerade tillstånd

En tom receptsamling visar en vänlig illustration och tydliga vägar till att skapa recept, importera ett recept eller återställa en säkerhetskopia. En tom sökning eller kategori ger ett förklarande meddelande och möjlighet att rensa sökningen eller visa alla recept.

## 6. Receptsidan

### 6.1 Översikt

Receptsidan öppnas med en Back-länk och en Options-meny. Menyn innehåller redigera och ta bort, med penna respektive papperskorg. Den behöver inte upprepa receptets titel. Ett nytt tryck på en redan öppen menyknapp stänger menyn.

Överst finns receptbilden, följd av titel, beskrivning, total tid och kategorier. Tiden står före kategorierna, som i listvyn, så att de inte korsar varandra i sidövergången. På mobil ligger bilden före texten. På större skärmar kan bild och sammanfattning visas sida vid sida. Bild, översikt och läsytans ytterkanter ska linjera.

Receptets valda färg fyller den övre delen av sidan. Kategorier, tid, bildkant och andra konturer använder samma formspråk som kortet. Konturer i den färgade delen är mörkare nyanser av receptfärgen i stället för neutralt grå. Bilden har en tunn färgtonad kant, rundade övre hörn och mycket svagt rundade nedre hörn.

Bild och detaljer visas alltid. Vi har tagit bort den tidigare uppdelningen mellan Recipe overview och Start cooking.

### 6.2 Den gemensamma headern under scroll

I början är headern och dess safe area benvita. När man scrollar ned komprimeras headern gradvis. Bakgrunden övergår till receptets färg och nederkanten får en aningen mörkare ton av samma färg.

Headern ska upplevas som en sammanhängande yta med området bakom telefonens klocka och batteri. Det finns ingen separat färgremsa som ska glida undan. Färgövergång och komprimering är mjuka i stället för att byta storlek abrupt. Knapparna behåller tillräckligt stora tryckytor trots den visuellt smala raden.

Vi har valt en opak färgad yta framför Liquid Glass i denna del. Telefonens operativsystem bestämmer fortfarande hur själva statusfältet ritas; webbappen kan påverka bakgrunden och webbläsarens temafärg men äger inte systemets ikoner.

### 6.3 Håll skärmen vaken

Keep screen on är en klassisk skjutreglageknapp med mer fyrkantiga, rundade hörn. Den ska inte krympa eller lyfta när man använder den. Funktionen använder webbläsarens skärmlås och visas bara där detta stöds.

Låset hör till receptvyn och släpps när man lämnar den. Webbläsaren eller batterisparläge kan ändå neka eller släppa låset, vilket visas med ett kort meddelande. Om appen åter blir synlig kan den försöka återta ett tidigare begärt lås.

Fokusknappen ligger på samma rad och i linje med denna kontroll på mobil.

### 6.4 Ingredienser och portionsantal

Ingredienser kan vara uppdelade i namngivna grupper, till exempel biffar, sås och servering. Grupperna ska följa med genom redigering, import, sparande och säkerhetskopiering.

Användaren väljer portionsantal i en gemensam menykomponent. Standardalternativen är 2, 4, 6, 8 och 10 portioner. Om receptets ursprungliga portionsantal är ett annat värde ska även det finnas tillgängligt.

Beräkningen utgår alltid från receptets sparade originalmängder och standardportioner. Den ändrar vad som visas, inte originalreceptet. Tydliga numeriska mängder, decimaler, bråk och lämpliga intervall kan skalas. Uttryck som salt efter smak lämnas kvar. Temperaturer, procent och tvetydiga tal ska inte få en gissad portionsomräkning.

Portionsmenyn stöder vanligt tryck, tangentbord och att hålla inne och dra genom alternativen. Förhandsvisningen följer det markerade värdet. Släpp utanför menyn avbryter valet.

Portionskontrollen ligger före Add to shopping list. Inköpsknappen öppnar ett urval av receptets ingredienser med det valda portionsantalet.

### 6.5 Instruktioner och tillagningsprogress

Instruktionerna visas som numrerade steg. Numret ligger i samma rundade kvadratiska kryssruta som används för avbockning. När ett steg markeras får texten en diskret överstrykning och raden kollapsar till en kompakt rad. Detta är alltid beteendet; det finns ingen separat inställning för det.

Steg kan ligga i namngivna avsnitt och kan ha bilder. Bilder som redan finns sparade visas utan att originalwebbplatsen behöver vara tillgänglig. Vissa kvarvarande bildlänkar kan användaren välja att hämta separat.

Ovanför stegen finns en liten progressangivelse och Reset. Reset återställer receptets avbockade steg och dess timers tillsammans, inklusive larm och schemalagda påminnelser. Portionsantalet och andra recept påverkas inte.

Avbockning, vald sektion och portionsantal är lokal matlagningsstatus. Om ett steg ändrats ska gammal progress inte kopplas på ett nytt steg av misstag.

### 6.6 Flikar på smal skärm

På små skärmar väljer man mellan Ingredients och Instructions i en sticky flikrad. Flikarna liknar webbläsarflikar: den aktiva vita fliken sitter ihop med den vita läsytan, medan den inaktiva har receptets bakgrundsfärg.

Övre hörn är rundade och de nedre övergångarna böjer utåt in i läsytan. Den aktiva formen glider mellan alternativen med en kort, flytande rörelse. Nederlinjen finns under den inaktiva fliken men gör ett avbrott under den aktiva, även under animationen.

Under flikarna finns först en liten ogenomskinlig vit zon och sedan en toning mot transparent. Den gör att text som passerar bakom raden försvinner mjukare. Rubrikerna Ingredienser och Instruktioner behöver inte upprepas direkt under flikarna, eftersom flikarna redan namnger innehållet.

I den vanliga receptvyn har vi valt sidans normala scroll. Ingredienser och instruktioner har inte separata scrollbehållare eller separata sparade scrollpositioner. Ett flikbyte ska därför inte försöka återställa ett gammalt scrollläge och dra hela sidan uppåt eller nedåt.

### 6.7 Två kolumner på bredare skärm

Från ungefär 640 px bredd visas ingredienser och instruktioner samtidigt. Flikarna försvinner och ersätts av tydliga sektionsrubriker. Instruktionerna får mer utrymme än ingredienserna och en tunn avdelare håller isär innehållet.

I liggande telefonläge och upp till tabletlika bredder används skärmens bredd effektivt. På riktigt breda skärmar blir läsytan ett centrerat vitt fönster med receptfärg runt omkring. Det undviker alltför långa textrader och tomma, utsträckta ytor på en stor bildskärm.

### 6.8 Näringsinformation och originalkälla

Om uppgifterna finns visas en utfällbar sektion med näring per portion: energi i kcal, protein, kolhydrater och fett. På breda skärmar sträcker sig sektionen över ingrediens- och instruktionskolumnernas gemensamma bredd.

Appen räknar inte fram näringsvärden från råvarorna. De kommer från importen eller användarens redigering. Därför ska felaktiga eller saknade källvärden inte döljas bakom en skenbart exakt automatisk beräkning.

Original recipe öppnar källreceptet i ett separat webbfönster med skyddad länköppning. På iPhone kan det se ut som ett webbfönster inom PWA:n. Receptet i Recipebook är fortfarande en självständig kopia.

### 6.9 Saknat eller borttaget recept

En otillgänglig receptsida visar en centrerad tom skål, en tydlig rubrik, förklarande text och en väg tillbaka till recepten. Hela återhämtningsvyn använder appens sammanhängande bakgrund i stället för en liten felrad på en annars tom sida.

## 7. Fokusläge för matlagning

Fokusläget är till för situationen när telefonen används som ett arbetsredskap i köket. Här visas ingredienser och instruktioner sida vid sida, även om telefonen hålls stående.

Eftersom en PWA inte säkert kan låsa iPhone-skärmens fysiska orientering använder appen en liggande arbetsyta som roteras vid behov. Det ger ett konsekvent landskapsformat utan att lova en systemfunktion som webbläsaren inte ger appen.

Fokusvyn har följande egenskaper:

- Två separata scrollbara kolumner, så att man kan ha rätt ingrediens och rätt steg synliga samtidigt.
- En mycket smal, benvit topprad med endast en X-knapp.
- Ingen synlig recepttitel och ingen färgad remsa i toppraden.
- Direkt benvit bakgrund även bakom statusområdet vid inträde i stående läge.
- Kompakt portionskontroll i ingredienskolumnen.
- Samma steg, avbockning och timers som i den vanliga receptvyn.
- Ingen Add to shopping list-knapp och ingen uppmaning att slå på aviseringar.
- Timeråterkoppling kan fortfarande visas inne i fokusläget.

När fokusläget stängs kommer användaren tillbaka till den vanliga receptsidans scrollposition. Fokusläget återanvänder receptets läsinnehåll, så att det inte finns två parallella uppsättningar steg och timerkomponenter som kan hamna ur synk.

## 8. Stegtimers och aviseringar

### 8.1 Varför timers sitter i stegen

En timer hör till den instruktion där tiden behövs. Användaren ska slippa lämna receptet, minnas stegets nummer och skapa en separat klocka i en annan app. Flera steg kan ha varsin timer.

### 8.2 Automatisk identifiering

Appen identifierar tydliga svenska och engelska tillagnings- eller väntetider, till exempel grädda i 30–40 minuter eller låt vila i 10 minuter. För ett intervall används den lägre gränsen, så att användaren kan kontrollera maten i tid. Även befintliga recept kan därför få en timer utan att först importeras om.

Identifieringen är avsiktligt försiktig. Temperaturer, hållbarhetsinformation, allmän total tidsåtgång och relativa förberedelsetider ska inte skapa ovidkommande nedräkningar. Funktionen försöker hitta en lämplig första tidsangivelse, inte tolka en instruktion som ett fullständigt automatiskt matlagningsprogram.

I redigeringsläget kan användaren lägga till en timer, ändra dess förinställning eller uttryckligen ta bort den. Ett borttaget automatiskt förslag ska förbli borttaget efter synk och säkerhetskopiering.

### 8.3 Tid och reglage

Timerkontrollen är kompakt och använder MM:SS. Användbar inställning är 00:00–60:00. Vi har valt bort timmar som egen siffergrupp för att hålla kontrollen enkel och konsekvent.

Över linjalen ligger minus, Start eller Stop, tidsvärdet, Reset och plus på en gemensam rad. Minus och plus ändrar en minut i taget. De fungerar även under en pågående nedräkning, utan att stoppa klockan eller kasta bort redan förfluten tid. En aktiv övertidsklocka har inte samma minutjustering.

Tiden går också att skriva. På mobil används numeriskt tangentbord och värdet markeras vid fokus. De sista två siffrorna är sekunder: 0100 betyder en minut och 6000 betyder sextio minuter. Kolon hjälper läsningen under inmatning. Start är avstängd vid noll.

Stop betyder paus, inte återställning. Samma knapp ersätter Start när klockan går. Reset återgår till receptets förinställning och tar bort timerprogress.

### 8.4 Minutlinjalen före start

Före start används en låg, rundad rektangel med tunna streck. Varje streck är en minut. Var femte minut har en liten siffra ovanför strecket. Skalan går från noll till sextio och kan sedan fortsätta runt igen.

Två olika gester finns kvar för jämförelse, men är separerade så att de inte påverkar varandra:

- **Swipe momentum, standardläget:** Skalan följer svepets riktning under en fast markör i mitten. Markören väljer värdet. Ett snabbt svep fortsätter med avtagande fart. Flera snabba svep åt samma håll kan bygga upp mer fart inom en rimlig maxhastighet. Ett tryck stoppar rörelsen vid det synliga mittvärdet och väljer inte ett annat tick.
- **Edge hold, det alternativa testläget:** Markeringen följer fingret. Mittenområdet står stilla, medan närhet till kanterna driver skalan fortare ju längre ut fingret ligger. Släpp stoppar rörelsen direkt. Detta läge har inte svepets efterrullning.

En tillfällig enhetslokal inställning väljer mellan lägena. Sidans scroll blockeras medan man faktiskt drar linjalen, inte efteråt. På dator finns musdragning, fokuserad mushjulsstyrning och tangentbordskontroller.

### 8.5 Aktiv och pausad timer

När timern startar förvandlas redigeringslinjalen till ett stillastående progressfält med många små streck. Hela den valda tiden ryms samtidigt, oavsett om timern är kort eller lång. Strecken representerar en dynamisk andel av hela tiden, inte alltid en sekund.

Alla streck börjar orange. Allt eftersom tiden går blir de svarta från höger till vänster. Det finns inga små tidsnummer, ingen flyttande huvudmarkör och ingen omgivande ruta i detta läge. Resultatet är mindre och enklare att läsa under matlagning. Tidsvärdet MM:SS finns kvar i reglagens rad ovanför.

Redigeringsskalans befintliga streck glider över till progressfältets platser. Extra streck fyller mellanrummen och etiketter samt ram tonas bort. Reset gör övergången åt andra hållet. Paus behåller det detaljerade progressläget.

Den aktiva progresslinjalen är inte dragbar. Det undviker oavsiktliga tidsändringar. Minutknapparna är däremot fortsatt tillgängliga under nedräkning.

### 8.6 När tiden går ut

När nedräkningen passerar noll blir tidsvärdet rött och börjar räkna upp övertiden. Alla progressstreck har då blivit svarta. Kontrollens gamla Timer finished-text och klockikon har tagits bort.

Om appen är synlig kan ett kort ljud upprepas i högst 30 sekunder från den ursprungliga sluttiden. Ljudet avbryts vid bland annat paus, återställning, avbockning eller när appen går till bakgrunden.

En tunn toast berättar vilket steg som är klart och vilken timerlängd som har förflutit. View step öppnar receptet och rätt instruktion när användaren själv väljer det. Appen byter inte sida automatiskt.

Om ett steg bockas av döljs dess timer och larmet avbryts. Vid kontroll av dagens
kod återställs också timerns lokala progress. Det avviker från det tidigare
önskemålet att avbockning bara ska stoppa klockan och behålla värdet; se avsnitt
17.6. Stop-knappen i själva timerkontrollen pausar däremot utan återställning.

Om en aktiv övertidstimer lämnas utan tillsyn återställs den efter en timme räknat från sluttiden. En uttryckligen pausad timer ligger däremot kvar pausad.

### 8.7 Bakgrundsaviseringar

Bakgrundslarm är ett aktivt tillval per konto och enhet. Det kräver inloggning, webbläsarstöd och användarens tillåtelse. På iPhone och iPad krävs att appen är installerad på hemskärmen.

Servern kan skicka en avisering vid sluttiden och högst en extra påminnelse en minut senare. Den försöker undvika telefonaviseringar när appen redan är synlig på samma enhet. Detta bygger på senast rapporterad närvaro och är inte ett absolut löfte i alla nätverks- och bakgrundssituationer.

Aviseringarna är korta och generiska, med stegnummer utan att lägga ut hela receptinnehållet på låsskärmen. Systemet avgör ljud och eventuell vibration; webbappen kan inte garantera identiskt vibrationsbeteende på alla telefoner.

Uppmaningen inne i receptet försvinner när aviseringar är aktiverade. Användaren kan också stänga uppmaningen om aviseringar ska förbli avstängda. Valet sparas lokalt. Inställningarna finns kvar på inställningssidan.

Timerförinställningar följer receptet och synkas. Pågående klockor hör till det aktuella kontot på den aktuella enheten; en timer blir inte automatiskt en gemensam klocka på alla inloggade enheter. Absoluta sluttider används så att navigation och tillfällig bakgrundskörning inte ensamma förstör nedräkningen. Operativsystem och nätverk gör ändå push till en påminnelsefunktion, inte ett garanterat exakt systemalarm.

## 9. Skapa och redigera recept

### 9.1 Formulärets ordning

Ett nytt manuellt recept börjar i redigeringsläget. Ordningen är byggd efter vad användaren behöver lägga in först:

1. Receptnamn.
2. Valfri bild, direkt under namnet.
3. Receptfärg.
4. Receptets standardantal portioner.
5. Ingredienser och eventuella ingrediensgrupper.
6. Instruktioner och eventuella steggrupper samt timers.
7. Kategorier.
8. Utfällbara valfria receptdetaljer.

Receptdetaljer omfattar beskrivning, total tid och näringsvärden per portion. Näring består av kcal, protein, kolhydrater och fett. Fälten för tid och näring valideras så att negativa värden inte sparas. Ett receptnamn behövs, men appen tvingar inte fram påhittad bild eller metadata.

Bild kan läggas till, ersättas eller tas bort. JPEG, PNG och WebP behandlas och komprimeras till en lämplig egen kopia. Bildbearbetning visar status och sparandet väntar tills bearbetningen är klar.

### 9.2 Återanvända rad- och gruppredigerare

Ingredienser och instruktioner använder samma grundmönster för att lägga till, ta bort, ordna och gruppera rader. Varje rad har minus till vänster och draghandtag till höger. Vi har valt bort små separata upp- och nedpilar på mobil. Tangentbordsanvändare kan flytta från handtaget med piltangenter.

Grupper kan skapas och döpas om. Rader kan flyttas mellan grupper genom dragning eller via Add / move, där flera rader kan väljas samtidigt. Lägg till-kontrollen finns efter gruppens befintliga rader i stället för långt ovanför den punkt där den nya raden ska hamna.

Textarea-fält växer med innehållet. Enter i en ingrediens skapar nästa ingrediensrad. Enter i en instruktion gör en ny textrad inom samma steg. Detta är en medveten skillnad eftersom en instruktion ofta behöver flera meningar och stycken.

Det går att klistra in en hel radbruten lista. Vanliga punktlistor och numrerade listor delas upp till rader, både för ingredienser och instruktioner. Tomma rader tas bort inför granskning och sparande.

Borttagna rader kan återställas med en kompakt Undo-funktion i redigeraren. Timerdefinitioner och eventuell stegmetadata följer sina rader när de flyttas.

### 9.3 Sparande och skydd mot dataförlust

Ett nytt recept går vidare till granskning via Review Recipe. Ett redan sparat recept använder Save Changes och uppdaterar den befintliga kopian.

Om man har gjort ändringar och försöker lämna sidan kommer en gemensam bekräftelse. Uppdatering eller stängning av webbfönstret kan använda webbläsarens egen varning. Frågor ska inte visas när det inte finns arbete att förlora. Kontobyte ska inte råka flytta ett pågående sparande till nästa konto.

## 10. Importera och granska recept

### 10.1 Importsidan

Importsidan har ett länkfält och en importknapp samt en kort förklaring av granskningen. Länken Search with Google öppnar en Google-sökning i ett separat webbfönster. Texten förklarar att användaren behöver kopiera receptlänken och sedan gå tillbaka och klistra in den i Recipebook.

Vi har valt denna lösning eftersom appen inte har rätt att läsa adressen från webbläsarens externa fönster eller godtyckliga receptwebbplatser. Det finns ingen egen inbäddad universalwebbläsare med en importknapp som följer användaren mellan andra webbplatser.

Den publicerade länkimporten kräver ett verifierat inloggat konto. Om användaren går till inloggningen ska receptlänken kunna vänta tills man kommer tillbaka. I lokal utveckling kan en separat lokal importserver användas.

### 10.2 Vad importen tar med

Importen läser strukturerad receptdata från offentliga HTTPS-sidor. Den kan ta med titel, beskrivning, ingredienser, instruktioner, portionsantal, total tid, huvudbild, stegbilder och tillgänglig näring per portion.

Gruppindelningar ska bevaras där källan gör dem möjliga att identifiera. För bland annat Recept.se har importen förbättrats efter att ingrediensgrupper saknades och en kaloriuppgift tolkades fel. Lärdomen är att korrigera en tydlig datatolkning, inte bygga en obegränsad samling sköra specialfall för varje sida. Redan sparade recept skrivs inte om tyst när importlogiken förbättras.

Vi har valt bort import av betyg, svårighetsgrad, författare, separata förberedelse- och tillagningstider, allmänna tips och automatiska taggar. Total tid och de uppgifter som faktiskt hjälper i den egna receptboken står i centrum. Vissa uttryckliga substitutionsuppgifter kan bevaras i beskrivningen.

Importerade kategorinamn får bara matcha kategorier som användaren redan har skapat. Importen ska inte fylla kontot med nya kategorier från webbplatsens egna nyckelord, kök eller kostetiketter.

### 10.3 Ingen webbplats-whitelist

Den tidigare listan över tillåtna receptdomäner har tagits bort. Det betyder att importen kan försöka läsa andra offentliga receptsidor, inte att varje sida garanterat fungerar.

Sidan måste tillhandahålla den strukturerade receptdata som importen kan läsa och tillåta serverhämtning. Inloggning, avancerat botskydd och recept som bara skapas genom körning av webbplatsens JavaScript kan stoppa importen. Appen ska inte försöka kringgå sådana åtkomstskydd.

Utvidgningen har kombinerats med skydd mot åtkomst till privata nätverk, kontroll av omdirigeringar, tids- och storleksgränser, säkra bildformat och begränsad bearbetning. Den externa sidan får inte användarens Recipebook-token, kontokakor eller serverhemligheter. Hämtad HTML behandlas som data och körs inte som kod i appen.

### 10.4 Bilder och importåterkoppling

Importbilder hämtas genom appens skyddade importväg och blir egna komprimerade kopior. Format, dimensioner och mängd begränsas för att undvika onödig minnesbelastning. Ett begränsat antal bilder laddas automatiskt; ytterligare stegbilder kan finnas kvar som manuellt hämtbara länkar.

Under importen visas en matlagningsillustration med gryta, ånga och ett receptblad. På mobil kan den använda en dämpad helskärmsfärg. Det finns en synlig avbryt-funktion. Ett misslyckande ska ge ett begripligt meddelande och ett avbrutet försök ska inte senare byta sida på egen hand.

### 10.5 Förhandsgranskningen

Granskningen återanvänder den vanliga receptsidans form. Det gör att användaren ser ungefär det färdiga resultatet i stället för en teknisk importdump.

En flytande rad erbjuder looks good!, cancel och edit. Endast godkännandet sparar ett nytt recept permanent. Edit öppnar redigeraren och kan sedan ta tillbaka användaren till granskningen.

Utkastet finns i minnet med en bästa möjliga kopia i flikens sessionslagring. Det är ett utkast, inte en ersättning för ett godkänt sparande. Stora bilder kan göra att sessionskopian inte ryms, vilket är ett skäl att skydda navigationsflödet och undvika falska löften om fullständig utkaståterställning.

## 11. Kategorier

Kategorier är manuellt skapade grupper av recept. Ett recept kan tillhöra flera kategorier, exempelvis Kyckling, Vardagsmat och Ugn.

På kategorisidan kan användaren:

- Skapa en kategori.
- Se hur många recept som tillhör varje kategori.
- Öppna en kategori och söka bland recepten.
- Välja flera recept och spara medlemskapet i ett sammanhang.
- Återställa ett osparat urval.
- Byta namn på kategorin.
- Ta bort kategorin utan att ta bort recepten.

Kategorier kan också väljas eller skapas i receptredigeraren och ändras via receptens snabbmeny. De används som filter på hemsidan och som synlig metadata på kort, i listan och på receptsidan.

Vi har helt tagit bort taggar som parallellt system. Användaren ska inte behöva avgöra om ett ord ska vara en kategori eller en tagg. Interna äldre namn som collections avser kategoridata och innebär inte att appen erbjuder flera separata kokböcker.

Kategorihantering ligger utanför inställningarna. Det är arbete med innehållet, inte en inställning för själva appen.

## 12. Inköpslistan

### 12.1 En sammanhängande privat lista

Inköpslistan nås via korgen i headern eller från ett recept. Den tillhör det aktiva kontot eller den utloggade enhetens data. Den är en vanlig privat arbetslista, inte en delad inköpslista för flera vänner samtidigt.

Toppen är kompakt: en tillbakalänk, sidrubrik och From recipe får plats i en gemensam verktygsrad. Under finns ett fält för egna produkter och en plusknapp. Flera radbrutna produkter kan klistras in. Enter lägger till och gör det lätt att fortsätta skriva nästa produkt.

En tom lista får en vänlig, centrerad introduktion och tydliga vägar att lägga till en egen produkt eller hämta ingredienser från ett recept.

### 12.2 Lägg till från recept

Från listan väljer man först ett recept, vid behov med sökning. Från receptsidan är receptet redan valt. Därefter kan man ändra portionsantal och markera de ingredienser som behövs.

Inga ingredienser är markerade från början. Det är ett medvetet beslut för att undvika att salt, olja och sådant man redan har läggs till automatiskt. Select all och Deselect all finns för större urval. Ingrediensgrupper och skalade mängder följer med i väljaren.

Om samma receptbidrag redan finns i listan får användaren bekräfta att en ny omgång verkligen ska läggas till. En oavsiktlig dubbeltryckning ska inte omedelbart dubblera inköpen.

### 12.3 Sammanför tydligt matchande mängder

Listan kan summera tydliga, kompatibla mängder i visningen, till exempel två separata bidrag med samma enhet och produkttext. Varje ursprungligt bidrag behålls i lagringen med sin källa.

Detta är ingen fri tolkning av liknande produktnamn. Tvetydiga mängder och olika enheter slås inte ihop genom gissning. Prästost och ost kan exempelvis tillhöra samma butiksavdelning utan att för den skull säkert vara samma inköpspost.

### 12.4 Koppling till recept med färgprickar

Efter produktnamnet kan en liten prick visa vilket recept produkten kommer från. Om flera recept bidragit kan flera prickar visas.

Direkt under inmatningsfältet finns en kompakt förklaring med receptnamn och samma färgprickar. Receptnamnen fungerar som länkar där receptet finns kvar. Vi har valt bort att skriva ut receptnamn och portionsantal under varje rad, eftersom det gjorde listan för hög och upprepande.

Källkopplingen behålls även om receptet senare saknas. Listans produkter ska inte försvinna bara för att ett källrecept tas bort.

### 12.5 Automatisk butiksindelning

Produkterna grupperas automatiskt efter avdelningar som är begripliga i en svensk matbutik. Rubrikerna är små och diskreta. Avstånden mellan produktrader ska upplevas jämna även över avdelningsgränser, så att det fortfarande ser ut som en enda lista.

Den aktuella ordningen är:

1. Frukt & grönt.
2. Bröd & kakor.
3. Kött, chark & fågel.
4. Fisk & skaldjur.
5. Vegetariskt.
6. Färdigmat & såser.
7. Mejeri, ost & ägg.
8. Skafferi.
9. Dryck.
10. Barn.
11. Hygien.
12. Städ, tvätt & papper.
13. Kök.
14. Djur.
15. Godis & snacks.
16. Fryst.
17. Övrigt.

Indelningen är inspirerad av ICA:s nätkategorier och en rimlig svensk butiksrunda, med frukt och bröd tidigt och frysta varor sent. Den är inte en exakt karta över en viss ICA-butik. Glass ligger tillsammans med frysta varor. Produktens form och förvaring kan väga tyngre än dess råvara, så att till exempel en fryst eller konserverad variant kan hamna på en annan avdelning.

### 12.6 Svensk produktordlista utan löpande nätanrop

Kategoriseringen kombinerar lokala regler med en kompakt ordlista av produktnamn och synonymer. Den bygger på Open Food Facts och kompletterande, granskade svenska livsmedelsnamn från Livsmedelsverket samt ostnamn.

Svenska produkter som blodpudding, gräddfil, prästost, hushållsost och andra ostvarianter är viktiga för målgruppen. Vi har valt att komplettera den breda ordlistan med sådana namn i stället för att kasta bort den tidigare datan.

Matchningen sker lokalt och fungerar offline. Användarens inköpslista skickas inte till en extern produktsökning för kategorisering. Ordlistan är inte ett fullständigt ICA-sortiment, hämtar inte priser eller lagersaldo och uppdateras inte automatiskt vid varje appstart.

Okända och tvetydiga poster hamnar under Övrigt. Ett varumärke ensamt avgör inte avdelning. Datamängden är storleksbegränsad och laddas med inköpssidans kod, så att den inte belastar appens första laddning i onödan. Källor, licenser och den bearbetade publika ordlistan är dokumenterade. Licensen avser ordlistan, inte användarens privata recept eller inköpslista.

### 12.7 Redigera, checka och rensa

Produkterna har gemensamma rundade kryssrutor. Ett långt tryck på produkttexten öppnar redigering. På dator finns även högerklick och tangentbordsgenvägar. Vi har tagit bort en separat synlig Edit-knapp på varje rad.

Minus ersätter radernas Delete-text. Vanliga borttagningar och rensningar kan erbjuda Undo. Att tömma en lista med kvarvarande omarkerade poster kräver en tydlig bekräftelse.

Markerade poster flyttas till slutet av samma lista. Det finns ingen separat Bought-sektion, inget extra kollapsreglage och inga upprepade avdelningsrubriker för dessa poster. Clear checked tar bort markerade poster. Benämningen checked är avsiktlig: att markera något behöver inte betyda att det har köpts.

Offlineändringar sparas på enheten och kan synkas när anslutningen återkommer.

## 13. Inställningar, konto och säkerhetskopior

### 13.1 Inställningarnas struktur

Inställningssidan är uppdelad i Account, Backups och App, med korta ankarlänkar mellan sektionerna. Den ska bara innehålla sådant som faktiskt är inställningar eller kontohantering. Receptskapande och kategorihantering har flyttats till relevanta innehållsflöden.

### 13.2 Konto och inloggning

Användaren kan skapa konto direkt i appen. Vi valde detta framför ett inbjudningsbaserat upplägg där ägaren först måste lägga upp varje vän manuellt.

Inloggningen använder e-postadress och lösenord. Nya lösenord behöver vara minst åtta tecken, utan krav på versaler, siffror eller specialtecken. Det finns bekräftelsefält vid skapande och byte samt möjlighet att visa eller dölja lösenorden. Den kontrollen har anpassats för att mobila webbläsare ska visa redan inskriven text direkt.

Forgot password? skickar en återställningslänk via e-post. Länken leder till flödet för att välja ett nytt lösenord. Även en redan inloggad användare kan begära återställning från kontoalternativen.

E-postbekräftelse och återställning hanteras av Supabase. Vi valde att tills vidare behålla Supabases standardavsändare. Projektets dokumenterade begränsning är att den inte är en generell produktionsavsändare till alla vänners adresser och har låga sändningsgränser. För tillförlitlig leverans utanför projektets tillåtna mottagare behövs en egen e-postavsändare/SMTP. Lösenordsfunktionen och detta leveransberoende är två skilda delar.

### 13.3 Enhetsdata när man loggar in

Om recept, kategorier eller inköpsposter har skapats utloggad får användaren välja att lägga dem på kontot eller radera enhetsdatan innan man fortsätter. Det finns inget val att behålla två parallella, synliga kokböcker.

Överföring ska bevara bilder, grupper, kategorimedlemskap och inköpsposternas receptkällor. Kontots lokala kopia och dess väntande molnändringar sparas innan oförändrade gästposter tas bort. Om överföringen avbryts ska kvarvarande enhetsdata inte bara försvinna.

Radering av denna enhetsdata har en extra, uttrycklig bekräftelse eftersom den inte har vanlig Undo. Data som redan tillhör kontot ska inte tas bort av valet.

### 13.4 Synk och utloggning

Account visar e-postadress, relevant synkstatus och Sync now. Synkstatus har flyttats bort från hemsidan för att receptbiblioteket ska vara lugnare.

Recept, kategorier, bilder och inköpsposter hör till användarens konto. Lokala ändringar kan köas när man är offline. Utloggning försöker synka först och ska inte kasta väntande ändringar bara för att nätverket är borta.

Utloggning behåller kontots offlinekopia på enheten. Den exponeras inte som utloggat innehåll i det vanliga gränssnittet, men den är inte krypterad mot någon som har tillgång till webbläsarprofilen. På en delad enhet behöver man därför synka eller säkerhetskopiera och sedan rensa webbplatsdata om den lokala kopian ska försvinna helt.

### 13.5 Säkerhetskopior

Download backup exporterar recept, bilder, kategorier och inköpslista till en fil. Återställning tar emot Recipebook-backuper och lägger till innehåll utan att avsiktligt tömma det som redan finns. Äldre receptbackuper stöds också.

Importerad backup valideras före lagring. Säkerhetskopiering ska inte råka exportera ett annat kontos data om användaren byter konto under operationen. Pågående timers är enhetslokalt matlagningsläge; själva timerförinställningarna är däremot del av receptinformationen.

### 13.6 Appinställningar

App-delen innehåller:

- Den tillfälliga jämförelsen mellan timerlinjalens två gestlägen.
- På- och avslag för bakgrundsaviseringar samt status och felåterkoppling.
- Tillgänglig appuppdatering och omladdning.
- Installation eller information om Lägg till på hemskärmen.
- Status för offlineanvändning när den finns tillgänglig.
- Käll- och licensinformation för produktordlistan.

Det finns inte längre någon inställning för att välja sidbläddringsanimation.

## 14. Designfilosofi och visuell identitet

### 14.1 En lugn digital bok med mat i centrum

Appen ska kännas varm, personlig och redaktionell. Den visuella riktningen bygger på benvita ytor, nästan svart text, tunna linjer, generöst men funktionellt luftutrymme och dämpade matnära färger.

De tidiga referenserna innehöll Anthropic-liknande enkelhet och tydlig typografisk hierarki. Under utvecklingen har bokkänslan, de färgade recepten och mer genomarbetad rörelse gett appen en egen identitet.

Stora bilder och recepttitlar ska locka till matlagning. Verktygen runt omkring ska hålla sig lugna. Vi undviker stora mängder skuggade kort, dekorativa slogans, onödiga etiketter och för många konkurrerande visuella hierarkier.

### 14.2 Typografi

Gränssnitt, etiketter och reglage använder Arial/Helvetica eller motsvarande sans-serif. Recepttitlar och den framträdande receptläsningen använder serif, främst Georgia. Kontrasten mellan dessa gör att recepten känns som innehåll i en bok och kontrollerna känns som funktioner runt boken.

Rubriker får vara stora och karaktärsfulla men ska inte bli godtyckligt avklippta. Listvyn prioriterar enhetlig skanning; kortvyn kan ge rubriken mer utrymme. För externa typsnitt finns inget behov i den nuvarande riktningen.

### 14.3 Färger

Basfärgerna är ungefär:

- Canvas: #F0EEE6.
- Vit/benvit läsyta: #FAF9F5.
- Primär text: #141413.
- Sekundär text: #5E5D57.
- Söklinjer och vissa aktiva reglage: dämpat grönt.
- Timerprogress: bränd orange, #AD571B.
- Fel och övertid: dämpad mörkröd, #923F35.

Varje recept kan ha en av tio ljusa, lågmälda färger:

| Färg                | Hex     |
| ------------------- | ------- |
| Oat / havre         | #EDE2D2 |
| Butter / smör       | #F4E7BC |
| Apricot / aprikos   | #F4DDC4 |
| Peach / persika     | #F5DCD5 |
| Rhubarb / rabarber  | #EEDCE2 |
| Lavender / lavendel | #E4DEED |
| Sage / salvia       | #DCE4D5 |
| Pistachio / pistage | #E4E8C9 |
| Mint / mynta        | #D6E8DF |
| Duck egg / äggblå   | #D5E3E9 |

Paletten valdes efter genomgång av mat-, köks- och mjuka färgreferenser. Färgerna ska fungera bakom svart text och samtidigt göra olika recept lätta att känna igen. Designguiden dokumenterar minst cirka 14:1 kontrast mot primärtexten och 5:1 mot sekundärtexten för dessa bakgrunder.

Automatic väljer en stabil färg utifrån receptet. Ett manuellt färgval sparas med receptet. Samma färg går igen i kort, översikt, flikar, listans färgremsa och inköpslistans källprick. Färg är därför både personlighet och orientering. Den ersätter inte text som enda sätt att förstå innehåll.

### 14.4 Form, kanter och luft

Kontroller är i huvudsak rektangulära med måttligt rundade hörn. Kryssrutor och timerreglage följer samma tanke. Keep screen on ska fortfarande kännas som en klassisk toggle, men inte som en överdrivet pillformad knapp.

Konturer är tunna och tydliga. Receptfärger får mörkare egna kanttoner. Skuggor reserveras främst för flytande menyer, dialoger och återkoppling. Vanliga listor hålls platta med tunna avdelare.

Marginaler ska skapa logiska grupper. Vi har både komprimerat överdrivet höga verktygssektioner och lagt tillbaka luft där kortvyn annars lämnade ett stort, ologiskt tomrum längst ned. Målet är inte minsta möjliga avstånd överallt, utan en bra rytm utifrån uppgiften.

### 14.5 Menyer och små interaktioner

Kategorier, portioner och snabbmenyer använder ett gemensamt diskret frostat menyuttryck. Därmed får dator och Android ett genomarbetat utseende utan att vara beroende av iPhones systemmenyer. Menyer ska även fungera med tangentbord, kunna stängas utifrån och ha ett tydligt opakt reservutförande.

Vi har gått ifrån bakgrundsfyllningar och att knappar lyfter på hover eller sjunker på klick. Ikoner, textvikt, konturer och begränsad opacitetsförändring ger lugnare återkoppling och håller layouten stadig.

Receptkort har ett avsiktligt undantag vid tryck: kanten blir tydligare och kortytan krymper mycket lite, till cirka 98,5 procent. Den blir inte ljusare. Detta ska kännas som att trycka på ett fysiskt objekt utan ett vitt blink.

På dator kan kortytan följa musen med en mjuk perspektivlutning. Beräkningen samordnas per bildruta och stannar när inget rör sig. Touchskärmar ska inte få en onödig perspektivnivå som stör svepning eller belastar bildhanteringen.

### 14.6 Logotyp

Logotypen är användarens egna vektorform från Final version.svg, inte bokstaven R satt i ett typsnitt. Formen kombinerar en boklik silhuett med ett R: en smal bindning, en rundad övre sida och en svängd nedre sida.

Installerad appikon och favicon behåller R-orienteringen. Appikonen använder en ljus markering mot mörk bakgrund. Headern använder en liten svart version roterad 90 grader moturs, så att bindningen ligger ned och märket uppfattas som en öppen bok.

Vid laddning kan R-märket tippa över till bokorienteringen. Den aktuella rörelsen har en liten förberedelse, en accelererande fallrörelse och ett bestämt stopp vid kontakten. Det ska kännas som att en bok slår ned mot en yta, inte studsar eller landar fjäderlätt. Rörelsen delas av appens laddningsvyer.

## 15. Rörelse, responsivitet och kvalitet

### 15.1 Kortet blir receptsidan

Den huvudsakliga sidövergången expanderar det valda receptet till dess sida. Hemsideinnehållet ligger kvar på sin plats och täcks av den växande receptfärgen; hela startsidan zoomas inte.

Bara de delar som faktiskt finns på båda sidor ska flyga mellan sina lägen: bild, titel, kategorier och tid, tillsammans med receptets färgyta. Beskrivningen försvinner snabbt före flytten och kommer tillbaka när landningen är klar. Receptspecifika knappar, flikar och läsinnehåll väntar på att de delade delarna ska komma på plats. Läsytan och flikarna kommer därefter in med en kort rörelse underifrån och en toning.

När ett recept öppnas från listan fyller först färgremsan den valda raden. Sedan expanderar samma färg vidare till receptsidan. Vid återgång dras färgen tillbaka till det aktuella kortet eller den aktuella raden, inte till en godtycklig punkt vid sidan om.

Titelns position och storlek ska interpoleras mjukt. Bildens beskärning, rundningar och kant ska följa animationen utan att byta utseende i sista bildrutan. Delade delar ska inte finnas dubbelt eller försvinna för tidigt.

Den gemensamma förflyttningen tar ungefär 430 ms. I listfallet tillkommer
cirka 100 ms inledande radfyllning. Inkommande livematerial tonas in på omkring
160 ms och läsytans entré tar cirka 180 ms. Dessa tidsrelationer ska hållas
samordnade genom gemensamma rörelsetokens.

### 15.2 Avbrott är ett normalt användningsfall

Användaren kan öppna och stänga snabbt, trycka igen, börja scrolla, byta orientering eller skicka appen till bakgrunden. Animationerna måste hantera detta utan att gamla händelser påverkar en ny övergång.

Arbetet med vita bildblinkningar har därför handlat om bildavkodning, ögonblicksbilder, bakgrundsytor, avbrutna övergångar och minnesbelastning. En övergång ska behålla en ogenomskinlig källbild tills destinationsbilden är redo. Gamla fördröjda återkopplingar får inte återstarta en avbruten animation.

Det är inte bara en fråga om GitHub Pages kapacitet: själva bild- och övergångsrenderingen sker på användarens enhet. En modern telefonwebbläsare har fortfarande begränsat minne och kan bete sig annorlunda än en snabb skrivbordsdator. Fysisk enhetsprovning är därför viktig och kodmässiga skydd är inte ett löfte om att varje webbläsarversion renderar identiskt.

### 15.3 Teknikval för rörelse

Vi har valt webbläsarens egna View Transitions för sidornas delade geometri och CSS/Web Animations för mindre effekter. Det behövs inte ett extra animationsramverk för varje effekt.

Ett gemensamt ansvar för navigationens tillstånd, fotoförberedelse och avslutning ersätter flera konkurrerande speciallösningar. Bildförberedelse hålls begränsad till ett litet arbetsminne. Bilder ska inte återavkodas i onödan när man snabbt passerar flera kort.

Vanlig navigation fungerar även utan delade övergångar. Reduce Motion ger ett lugnare eller omedelbart alternativ, utan tilt, efterrullning och större rumsliga förflyttningar.

### 15.4 Laddningsskärm och uppdateringar

När appen verkligen startar finns en täckande benvit yta med logotypen redan innan hela appkoden har laddats. Den ligger kvar tills den första sidan, typsnitten och synliga bilder har fått möjlighet att bli klara.

Logotypens rörelse kör samtidigt med laddningen. Reservvägar ser till att en misslyckad bildavkodning eller animation inte låser användaren bakom skärmen. När innehållet är redo tonas täckytan bort. Den ska inte återkomma vid varje vanlig navigering mellan recept.

Nya PWA-versioner hämtas i bakgrunden. En diskret Update available-toast erbjuder Reload. Den ska få använda mobilskärmens bredd och vara låg nog att inte skymma onödigt mycket. Osparat arbete skyddas även vid omladdning.

### 15.5 Responsivitet

Layouten anpassas efter innehållets behov och tillgänglig bredd, inte en lista med identifierade telefonmodeller.

- Smal mobil: bild ovanför text, ett läspanelval i taget, sticky flikar och bekväma tryckytor.
- Liggande mobil och tablet: bredden används bättre och båda läspanelerna kan visas samtidigt utan överflödiga yttermarginaler.
- Stor dator: innehållet centreras inom ett läsbart maxmått med sidoutrymme som hör till appens färgade värld.
- Fokusläge: särskild liggande arbetsyta och två oberoende scrollkolumner.

Den globala layouten har ett maxmått kring 1360 px och formulär kring 800 px. På mycket breda receptskärmar används ett vitt läsfönster omkring 1200 px. Safe areas runt sensoröar och skärmkanter tas hänsyn till utan att hela bakgrunden krymps till en smal mittremsa.

### 15.6 Tillgänglighet

Designen eftersträvar tydlig kontrast, semantiska rubriker, begripliga knappar, tangentbordsnavigation, synlig tangentbordsfokus och stora tryckytor, normalt minst 44 px. En genväg till huvudinnehållet finns för tangentbordsanvändare.

Färgprickar får kompletterande textinformation för hjälpmedel. Menyer och dialoger ska ha korrekta namn, fokushantering och stängningsvägar. Kontroller som ännu inte är färdiga att användas under en övergång ska inte vara oavsiktligt klickbara.

Timers ska inte läsas upp av skärmläsaren varje sekund. Viktig återkoppling samlas i begripliga statusmeddelanden. Anpassningen för minskad rörelse är en del av funktionens utformning, inte en eftertanke.

## 16. Viktiga beslut och förändringar längs vägen

### 16.1 Från e-postinloggning till lösenord

En lösning där man behövde få ett e-postmeddelande vid varje inloggning kändes opraktisk. Vi gick därför mot Supabase med e-post och eget lösenord. Konton skapas i appen, inte bara genom inbjudan. Lösenordspolicyn förenklades till minst åtta tecken utan teckentvång. E-poståterställning behölls.

Gamla befintliga konton behövde inte få ett särskilt efterhandsflöde för att lägga till lösenord; användaren godkände att tidigare testkonton kunde rensas. Detta ska inte förväxlas med att framtida kontobyten eller utloggning får förstöra användardata.

### 16.2 En aktiv kokbok, kategorier i stället för parallella system

Vi tog bort idén att användaren ska hålla en separat enhetskokbok bredvid kontots kokbok efter inloggning. Enhetsinnehåll ska flyttas in eller raderas genom ett tydligt val. Kategorier blev den gemensamma organisationen. Taggar togs senare bort helt för att förenkla både gränssnitt och metadata.

### 16.3 Inställningar avlastades

Att skapa och ordna recept hör hemma i biblioteket och redigeraren. Inställningar begränsades därför till konto, backuper och apprelaterade val. Synkstatus flyttades från startsidan till den plats där den är relevant.

### 16.4 Matlagning utan ett extra startläge

Start cooking och en separat Recipe overview-lösning togs bort. Bild och receptdetaljer ska alltid finnas överst. Avbockade steg ska alltid kollapsa, så ett reglage för den detaljen behövdes inte.

### 16.5 Flikarna utvecklades till bokliknande browser tabs

Ingredienser och instruktioner gick från enklare växlingsknappar till riktiga flikar. Därefter förfinades rörelse, utåtböjda nedre hörn, inaktiv receptfärg, vit läsyta och en nederlinje som inte skär av den aktiva fliken. En vit zon och toning lades till så att scrollande text inte klipps lika brutalt.

### 16.6 Gemensam scroll i vardagsvyn, separat scroll i fokus

Oberoende sparade scrollpositioner för vanliga receptflikar provades men gjorde sidbyten och flikbyte svårare att förutse. Det togs bort. Det är fokusläget som har ett tydligt skäl för två egna scrollbara arbetskolumner.

### 16.7 Mobil- och datorlayout fick olika uppgifter

Liggläge på telefon ska inte se ut som ett desktopfönster med stora sidomarginaler och bara en synlig panel. På bredare skärmar visas båda sektionerna. På riktigt stora datorer behålls däremot ett begränsat läsmått. Bild och läsytor har justerats för att linjera över dessa storlekar.

### 16.8 Headerns glasidé ersattes med färg

Liquid Glass och oskärpa provades i den sticky headern, men gav inte ett tillräckligt bra och förutsägbart resultat tillsammans med iPhones statusyta. Vi valde i stället en solid yta som övergår från benvitt till receptfärgen. Headern blev smalare vid scroll men fick en mjuk storleksförändring och bevarad färgtonad skiljelinje.

Menyerna har däremot kvar ett eget diskret frostat uttryck. Att headern inte ska vara glas innebär alltså inte att alla appens överlägg måste vara helt utan djup eller transparens.

### 16.9 Sidbläddring ersattes av expansion

En tidig animation skulle efterlikna en boksida som lyfts från nedre högra hörnet och böjs. Den utvecklades med referenser till bokanimationer och utvärderades som ett val bredvid kortexpansionen.

Senare valde vi att ta bort page flip från appen och från inställningarna. Den tidigare koden skulle sparas separat för eventuell framtida användning. Det är nu kortets eller listradens expansion som är produktens huvudsakliga sidövergång.

### 16.10 Känsla fick inte gå före stabilitet

Vitblinkande bilder, snabba öppna/stäng-gester och mobilkrascher ledde till refaktorering och förenkling. Fokus flyttades mot en gemensam ägare av animationerna, kontrollerad bildförberedelse, begränsat minne och säkra avbrott. Beslutet var inte att ta bort ambitionen om bra rörelse, utan att göra den mer robust.

### 16.11 Mindre studs och förflyttning i vardagskontroller

Många små hover- och tryckeffekter lyfte eller flyttade element. De ersattes med diskret kontur-, ikon- och textåterkoppling för bättre konsekvens. Kortet får sin lilla fysiska tryckkänsla men blir inte ljusare. Timers, sökkryss, Options och Reset ska inte hoppa omkring.

### 16.12 Listvyn blev enklare igen

Vi provade helt färgade horisontella receptkort med fler rader titel. Den nuvarande listan återgår till en kompakt, platt rad med fyrkantig bild, smal färgremsa, två titelrader och en konsekvent metadatarad. Färgen får en tydlig roll i öppningsanimationen i stället för att färga hela listan permanent.

### 16.13 Timerkontrollen förfinades stegvis

Timern började som en enkel ruta med klockikon och minutknappar. Därefter prövades direktinmatning, timfält, hållreglage, en rörlig detaljlinjal och flera placeringar av knapparna.

Dagens beslut är MM:SS och högst 60 minuter, en kompakt knapprad, en redigeringslinjal före start och ett stilla dynamiskt progressfält under gång. Stop pausar. Reset återställer. Plus och minus kan justera en aktiv nedräkning. Svep och kanthåll har separata testlägen eftersom de tidigare konkurrerade.

### 16.14 Inköpslistan blev en del av receptflödet

Inköp lades till som ett sammanhängande nästa steg efter recept och portioner. Urvalet börjar tomt. Receptkällor visar sig med färgprickar i stället för upprepade textrader. Svenska butiksavdelningar och en lokal produktordlista gör listan mer användbar i målgruppens verkliga mataffärer.

Rubrikerna tonades ned och en separat Bought-sektion togs bort. Markerade produkter hamnar bara längst ned. Det speglar att en avbockning kan betyda annat än ett genomfört köp.

### 16.15 Import från fler webbplatser utan att släppa säkerhetsgränsen

Domänlistan togs bort för att användaren ska kunna prova fler receptkällor. I stället förstärktes kontroller av själva hämtningen. Produktbeslutet är öppenhet för offentliga recept, inte åtkomst till privata nätverk eller möjlighet att låta en receptwebbplats köra kod med appens behörighet.

### 16.16 En egen symbol i stället för en generell bokikon

Logotypen utvecklades från bok- och bokstavsidéer till användarens egna slutliga vektor. Vi skiljer nu mellan R som appikon och bokorienteringen i headern. Laddningsrörelsen binder ihop de två lägena och har senast ändrats från mjuk sättning till ett tydligt, bokliknande nedslag.

### 16.17 Beslut efter granskningen 27 oktober 2026

- Appen ska inte hålla koll på när man lagar mat: ingen timerpill i headern, ingen rad med ”Fortsätt laga” och inget filter för senast lagade recept.
- Gränssnittet ska på sikt finnas på både svenska och engelska. Det görs senare.
- En lätt planering (”Att laga den här veckan” med ”handla till alla”) är en bra idé men görs senare.
- Flytt till ett eget origin (egen domän) görs senare.
- Avbockning av ett steg pausar dess timer och behåller värdet (se 8.6).
- Ingredienser kan bockas av under matlagning utan att strykas över (se 6.4).

## 17. Lagring, integritet och drift

### 17.1 Teknikens huvuddelar

Appen är byggd som en Angular-applikation med återanvändbara komponenter och signalbaserat tillstånd. Dexie/IndexedDB lagrar recept, bilder och arbetsdata i webbläsaren. Supabase hanterar konto, privat molndata, bilder, länkimport och schemalagda timeraviseringar.

Bilder lagras i en egen bildtabell, en gång per enhet och namngivna efter SHA-256 av sina JPEG-byte, samma namn som molnlagringen använder. Recept och steg pekar på bilden med ett `photoId`. Kort, listrader och väljare visar en mindre kopia på högst 800 pixlar. Sidan gör bildadresser klara innan navigeringen börjar, så delade övergångar aldrig fångar en tom bild. Äldre recept med inbäddade data-URL:er visas som förut. Synk laddar bara upp bilder vars sökväg receptet inte redan har synkat och hämtar aldrig en bild som redan finns på enheten. Backupfiler innehåller fortfarande bilderna som data-URL:er, så de kan återställas på alla enheter och i äldre versioner. När gästrecept flyttas in i ett konto följer bilderna med.

GitHub Pages levererar den statiska frontendappen. Det är inte den tjänsten som kör användarens lokala sidanimation eller timerljud. Publicering av frontend och publicering av serverfunktioner är separata steg.

### 17.2 Privata konton och lokal förstahandsanvändning

Molnposter och privata bilder kontrolleras utifrån ägare. Inloggningens lösenord hanteras av Supabase, inte som egna klartextfält i receptdatabasen. Frontend innehåller publika anslutningsuppgifter, inte administratörshemligheter.

Lokala data separeras per konto. Ett byte av konto avbryter eller ogiltigförklarar gamla sidresultat, utkast, sparanden och återkopplingar där det behövs. Det minskar risken att förra kontots innehåll dyker upp i nästa kontos vy.

Det finns inga inkluderade analysverktyg eller externa annonsskript i den beskrivna implementationen. Recept och inköp skickas inte till en extern AI-tjänst för klassificering eller animering.

### 17.3 Offline och dess gränser

Installerad app och redan sparade recept kan användas offline när nödvändiga appfiler och data finns på enheten. Redigering och inköpsarbete kan sparas lokalt och köas för senare synk.

Att logga in, importera nya webblänkar, hämta ännu osparade bilder eller synka nya ändringar kräver däremot anslutning. En webbläsare eller enhetsägare kan radera lokal lagring. En säkerhetskopia är därför fortfarande värdefull även med molnsynk.

Efter första lokala sparandet ber appen webbläsaren om beständig lagring. Under Inställningar → Backups står om enheten behåller kokboken och när en backup senast laddades ner här. Safari kan radera lagringen för webbplatser som inte ligger på hemskärmen efter sju dagars användning utan besök, så en utloggad användare i en webbläsarflik får en enda påminnelse efter första sparade receptet om att installera appen, logga in eller spara en backup.

Offlinekopior är inte end-to-end-krypterade. Logga ut är inte samma sak som att säkert utplåna all lokal data. Ett särskilt kontoraderingsflöde är inte en funktion som ska antas finnas bara för att det går att ta bort ett recept.

### 17.4 Borttagning och återställning

Vanlig receptborttagning har bekräftelse och en Undo-toast i ungefär sex sekunder. Återställningen ska kunna bevara receptets bilder, grupper och kategorier i det konto där det togs bort.

Synken använder raderingsmarkeringar så att en gammal offlineenhet inte direkt återskapar ett redan borttaget recept. Att radera ett recept är däremot inte ett löfte om att varje historiskt bildobjekt omedelbart rensas från molnlagringen. Automatisk städning av överblivna privata bildobjekt är en dokumenterad begränsning.

### 17.5 Publicering och kvalitet

Appen publiceras från huvudgrenen genom GitHub Actions. Vi har prioriterat att bevara möjlighet att återgå till tidigare fungerande versioner. Byggfiler, hemligheter och lokala granskningsartefakter ska inte skräpa ned det publika repositoriet.

Automatiska tester används för bland annat datamodeller, import, kontogränser, gestbeteende, timerlogik och avbrutna animationer. Synliga interaktioner kontrolleras också i webbläsare. Visuell känsla på fysisk iPhone kan inte ersättas helt av tester på dator.

Förändringar ska vara små nog att förstå, återanvända befintliga komponenter och inte lägga till stora beroenden för problem som webbläsaren redan löser. Prestanda är en del av designkvaliteten: en snygg första bildruta räcker inte om interaktionen hackar, tappar tillstånd eller känns osäker.

### 17.6 Noterad skillnad mellan tidigare beslut och dagens kod

Vi hade beslutat att avbockning av ett steg skulle dölja och stoppa timern utan att återställa dess värde. Den aktuella receptsidan använder i stället Reset för en avbockad timers ändrade lokala tillstånd. Därför beskriver denna fil inte bevarad timerprogress efter avbockning som en befintlig funktion.

Stop-knappen fungerar fortfarande som paus. Skillnaden gäller just avbockningen och bör stämmas av vid fortsatt funktionsarbete. Ingen appkod har ändrats som del av denna dokumentation.

## 18. Kärnan att bevara vid framtida designarbete

Recipebook ska vara en personlig bok som också är ett praktiskt köksverktyg. Det som bör styra fortsatt utveckling är:

- Recept och matbilder är huvudpersoner.
- Att samla, hitta, handla och laga hör ihop i ett enkelt flöde.
- Användaren ska förstå var data sparas och inte förlora arbete vid utloggning.
- Kategorier ska vara begripliga och användarstyrda.
- Mobil matlagning och butiksanvändning behöver tydlighet och stora tryckytor.
- Datorn ska ge bättre överblick utan att innehållet sprids över orimlig bredd.
- Matnära pasteller, serifinnehåll, benvita läsytor och tunna konturer bär identiteten.
- Animationer ska ge kontinuitet och fysisk känsla med kontrollerad energi.
- Tillfredsställande rörelse måste tåla avbrott och kännas stabil på riktiga telefoner.
- Återanvändning, integritet, tillgänglighet och prestanda ska styra hur upplevelsen byggs, inte synas som teknisk komplexitet för användaren.

En vidareutveckling bör stärka dessa egenskaper snarare än göra Recipebook till en social plattform, en fullständig matbutiksintegration eller ett inställningstungt system för flera parallella kokböcker.

## Underlag

Beskrivningen har kontrollerats mot aktuella sidmallar och komponenter för bibliotek, recept, fokusläge, redigering, import, kategorier, inköp och inställningar. Viktiga projektunderlag är README.md, DESIGN.md, IMPORTING.md och SECURITY.md samt modeller och tjänster för recept, inköp, timer, portionsskalning, lokal lagring och kontosynk.

Där äldre designanteckningar beskriver ett tidigare utförande har den aktuella implementationen och de senare uttryckliga besluten prioriterats, exempelvis listans två titelrader, instruktionernas Reset för både steg och timers och skillnaden mellan normal sidscroll och fokuslägets separata scrollkolumner.
