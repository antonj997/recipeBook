import { describe, expect, it } from 'vitest';
import { groupByShoppingDepartment, shoppingDepartment } from './shopping-department';
import type { ShoppingGroup } from './shopping-item';

describe('shopping department recognition', () => {
  it.each([
    'Prästost',
    'Arla Präst 31%',
    'Allerum Grevéost 28%',
    'Herrgård',
    'Gorgonzola',
    'Pecorino',
    'Gruyère',
    'Manchego',
    'Stilton',
    'Provolone',
    'Svecia',
    'Wrångebäcksost',
    '150 g riven prästost',
    'Goudaost',
  ])('recognizes a named cheese through the offline catalogue: %s', (name) => {
    expect(shoppingDepartment(name)).toBe('dairy');
  });

  it('does not classify a brand or a word fragment as cheese', () => {
    expect(shoppingDepartment('Arla')).toBe('other');
    expect(shoppingDepartment('Falbygdens')).toBe('other');
    expect(shoppingDepartment('prästosthyvel')).toBe('other');
    expect(shoppingDepartment('prästost och broccoli')).toBe('other');
  });

  it.each([
    ['2 röda lökar, finhackade', 'produce'],
    ['½ gurka', 'produce'],
    ['1 kruka färsk basilika', 'produce'],
    ['3 gröna paprikor', 'produce'],
    ['250 g färska champinjoner', 'produce'],
    ['4 äpplen', 'produce'],
    ['1 knippe persilja', 'produce'],
    ['2 lemons', 'produce'],
    ['200 g cherry tomatoes', 'produce'],
    ['2 spring onions', 'produce'],
    ['400 g kycklingfilé, servera med ris', 'meat'],
    ['500g nötfärs', 'meat'],
    ['ICA bacon 140g', 'meat'],
    ['1 paket rökt skinka', 'meat'],
    ['2 chicken breasts', 'meat'],
    ['300 g minced beef', 'meat'],
    ['4 laxfiléer', 'fish'],
    ['200 g skalade räkor', 'fish'],
    ['2 salmon fillets', 'fish'],
    ['1 kg musslor', 'fish'],
    ['2 dl vispgrädde', 'dairy'],
    ['2 ägg', 'dairy'],
    ['100 g riven parmesanost', 'dairy'],
    ['1 dl crème fraîche', 'dairy'],
    ['50 g smör, smält', 'dairy'],
    ['1 l laktosfri mjölk', 'dairy'],
    ['1 liter havremjölk', 'dairy'],
    ['Oatly iMat havregrädde', 'dairy'],
    ['25 g färsk jäst', 'dairy'],
    ['2 tbsp cream cheese', 'dairy'],
    ['4 eggs', 'dairy'],
    ['100 g unsalted butter', 'dairy'],
    ['200 g tofu', 'vegetarian'],
    ['1 paket vegofärs', 'vegetarian'],
    ['2 vegan sausages', 'vegetarian'],
    ['1 surdegsbröd', 'bakery'],
    ['4 hamburgerbröd', 'bakery'],
    ['1 loaf bread', 'bakery'],
    ['Kanelbullar', 'bakery'],
    ['Färsk pasta', 'ready-meals'],
    ['1 färdig lasagne', 'ready-meals'],
    ['Pannkakor', 'ready-meals'],
    ['Barnmat med kyckling', 'baby'],
    ['Blöjor', 'baby'],
    ['Vaniljglass', 'treats'],
    ['1 påse chips', 'treats'],
    ['100 g mörk choklad', 'treats'],
    ['2 l apelsinjuice', 'drinks'],
    ['Kaffe', 'drinks'],
    ['1 flaska kolsyrat vatten', 'drinks'],
    ['2 dl vetemjöl', 'pantry'],
    ['1 tsk salt', 'pantry'],
    ['Freshly ground black pepper', 'pantry'],
    ['White pepper to taste', 'pantry'],
    ['1 kruka färsk rosmarin', 'produce'],
    ['400 g pasta', 'pantry'],
    ['Salt to taste', 'pantry'],
    ['200 g flour', 'pantry'],
    ['1 burk krossade tomater', 'pantry'],
    ['2 msk tomatpuré', 'pantry'],
    ['1 burk kokosmjölk', 'pantry'],
    ['1 burk crème fraîche', 'dairy'],
    ['1 burk keso', 'dairy'],
    ['1 burk ICA majs', 'pantry'],
    ['200 ml coconut cream', 'pantry'],
    ['400 g smörbönor', 'pantry'],
    ['1 msk jordnötssmör', 'pantry'],
    ['1 tsk vitlökspulver', 'pantry'],
    ['1 tsp garlic powder', 'pantry'],
    ['2 dl kycklingbuljong', 'pantry'],
    ['2 tbsp fish sauce', 'pantry'],
    ['1 tsk torkad basilika', 'pantry'],
    ['1 burk tonfisk i olja', 'pantry'],
    ['Soltorkade tomater', 'pantry'],
    ['1 påse torrjäst', 'pantry'],
    ['Ströbröd', 'pantry'],
    ['300 g frysta ärtor', 'frozen'],
    ['Fryst kyckling', 'frozen'],
    ['250 g frozen spinach', 'frozen'],
    ['Fryst pizza', 'frozen'],
    ['Frystorkade jordgubbar', 'pantry'],
    ['Toalettpapper', 'household'],
    ['Diskmedel', 'household'],
    ['Kitchen roll', 'household'],
    ['Schampo', 'beauty'],
    ['Tandkräm', 'beauty'],
    ['Kattmat med lax', 'pets'],
    ['Dog food chicken', 'pets'],
    ['Bakplåtspapper', 'kitchen'],
    ['Aluminiumfolie', 'kitchen'],
  ])('places %s with its usual shop department', (text, expected) => {
    expect(shoppingDepartment(text)).toBe(expected);
  });

  it.each(['Batterier', 'Mormors favorit', 'Post-it block', 'Present till mamma', ''])(
    'keeps an unknown product in Övrigt: %s',
    (text) => {
      expect(shoppingDepartment(text)).toBe('other');
    },
  );

  it('does not use a different ingredient in an alternative or preparation note', () => {
    expect(shoppingDepartment('2 citroner eller citronjuice')).toBe('produce');
    expect(shoppingDepartment('2 dl mjölk (eller kokosmjölk)')).toBe('dairy');
    expect(shoppingDepartment('1,5 dl grädde, till kycklingen')).toBe('dairy');
  });

  it.each([
    ['200 g tomater (konserverade)', 'pantry'],
    ['200 g tomater (canned)', 'pantry'],
    ['200 g broccoli, fryst', 'frozen'],
    ['200 g broccoli (fryst, i buketter)', 'frozen'],
    ['200 g tomater (eller konserverade)', 'produce'],
    ['1 dl mjölk till pannkakor', 'dairy'],
    ['2 dl milk for pancakes', 'dairy'],
    ['2 dl milk for frozen pancakes', 'dairy'],
  ])('keeps the product and its storage clues, not serving notes: %s', (text, expected) => {
    expect(shoppingDepartment(text)).toBe(expected);
  });

  it('keeps unrelated products separate from ingredient substrings', () => {
    expect(shoppingDepartment('osthyvel')).toBe('kitchen');
    expect(shoppingDepartment('saltvattenspray')).toBe('beauty');
    expect(shoppingDepartment('film till kameran')).toBe('other');
  });

  it('keeps a mixed entry in Övrigt when it crosses departments', () => {
    expect(shoppingDepartment('mjölk & bröd')).toBe('other');
    expect(shoppingDepartment('salt och peppar')).toBe('pantry');
    expect(shoppingDepartment('rye and wheat bread and milk')).toBe('other');
  });
});

describe('shopping department sections', () => {
  const group = (key: string, text: string): ShoppingGroup => ({
    key,
    text,
    checked: false,
    items: [],
    sources: [],
  });

  it('brings matching departments together while preserving row identity and within-department order', () => {
    const milk = group('milk', '2 l mjölk');
    const rice = group('rice', '1 kg ris');
    const eggs = group('eggs', '6 ägg');
    const apple = group('apple', '3 äpplen');
    const unknown = group('unknown', 'Batterier');
    const input = Object.freeze([milk, rice, eggs, apple, unknown]);
    const result = groupByShoppingDepartment(input);
    expect(result.map((department) => department.id)).toEqual([
      'produce',
      'dairy',
      'pantry',
      'other',
    ]);
    expect(result.map((department) => department.groups.map((row) => row.key))).toEqual([
      ['apple'],
      ['milk', 'eggs'],
      ['rice'],
      ['unknown'],
    ]);
    expect(result[1].groups[0]).toBe(milk);
    expect(input.map((row) => row.key)).toEqual(['milk', 'rice', 'eggs', 'apple', 'unknown']);
  });

  it('does not show empty departments and classifies existing groups without changing saved items', () => {
    expect(groupByShoppingDepartment([])).toEqual([]);
    const milk = group('milk', '1 l mjölk');
    milk.sources = [
      {
        recipeId: 'chicken',
        recipeTitle: 'Kyckling med ris',
        servings: 4,
        ingredientIndex: 0,
        originalText: '1 l mjölk',
      },
    ];
    const section = groupByShoppingDepartment([milk]);
    expect(section).toHaveLength(1);
    expect(section[0].id).toBe('dairy');
    expect(milk.sources[0].recipeTitle).toBe('Kyckling med ris');
  });
});

describe('catalogue and existing-rule interactions', () => {
  const products = [
    ['oat milk', 'dairy'],
    ['almond milk', 'dairy'],
    ['Arla oat milk', 'dairy'],
    ['soy milk', 'dairy'],
    ['soy yogurt', 'dairy'],
    ['blueberry yogurt', 'dairy'],
    ['strawberry yogurt', 'dairy'],
    ['vanilla yogurt', 'dairy'],
    ['rye bread', 'bakery'],
    ['oat bread', 'bakery'],
    ['oyster mushrooms', 'produce'],
    ['sandwich bread', 'bakery'],
    ['vegetable oil', 'pantry'],
    ['wheat beer', 'drinks'],
    ['English cheddar', 'dairy'],
    ['English Stilton', 'dairy'],
    ['Welsh cheddar', 'dairy'],
    ['sweet apples', 'produce'],
  ] as const;
  for (const [name, department] of products) {
    it(`keeps ${name} in ${department} when catalogue aliases overlap`, () => {
      expect(shoppingDepartment(name)).toBe(department);
    });
  }
});

describe('named compound products', () => {
  for (const [name, department] of [
    ['cookies with chocolate and coconut', 'bakery'],
    ['rye and wheat bread', 'bakery'],
    ['200 g frozen cakes and pastries', 'frozen'],
    ['canned leek and potato soups', 'pantry'],
    ['fruit and vegetable juice', 'drinks'],
  ] as const) {
    it(`recognizes ${name} as one product before splitting mixed entries`, () => {
      expect(shoppingDepartment(name)).toBe(department);
    });
  }
});

describe('common Swedish groceries', () => {
  const cases = [
    ['Ål', 'fish'],
    ['Renskav', 'frozen'],
    ['Älgskav', 'frozen'],
    ['Blodpudding', 'meat'],
    ['Geas blodpudding 500 g', 'meat'],
    ['Isterband', 'meat'],
    ['Kassler', 'meat'],
    ['Leverpastej', 'meat'],
    ['Gräddfil', 'dairy'],
    ['Arla gräddfil 12%', 'dairy'],
    ['Prästost', 'dairy'],
    ['Hushållsost', 'dairy'],
    ['Havredryck', 'dairy'],
    ['Äggvita', 'dairy'],
    ['Jordärtskockor', 'produce'],
    ['Rödbetor', 'produce'],
    ['Kålrot', 'produce'],
    ['Fänkål', 'produce'],
    ['Hjortron', 'produce'],
    ['Ostronskivling', 'produce'],
    ['Kavring', 'bakery'],
    ['Regnbågslax', 'fish'],
    ['Röding', 'fish'],
    ['Stenbitsrom', 'fish'],
    ['Lingonsylt', 'pantry'],
    ['Bostongurka', 'pantry'],
    ['Torkade fikon', 'pantry'],
    ['Fikon torkade', 'pantry'],
    ['Fikon', 'produce'],
    ['Rågkross', 'pantry'],
    ['Ättiksprit', 'pantry'],
    ['Julmust', 'drinks'],
    ['Örtte', 'drinks'],
    ['Ostbågar', 'treats'],
    ['Tångkaviar', 'vegetarian'],
    ['Fiskpinnar', 'frozen'],
    ['fryst blodpudding', 'frozen'],
    ['Barngröt', 'baby'],
    ['Tillskottsnäring', 'baby'],
  ] as const;
  for (const [name, department] of cases) {
    it(`places ${name} in ${department}`, () => expect(shoppingDepartment(name)).toBe(department));
  }
});
