// 推車販售品項(遊戲用價格)。key = 點餐時按的數字鍵。
export const ITEMS = {
  pork:    { id: 'pork',    name: '排骨便當', short: '排骨', price: 80,  kind: 'bento', unit: '個', key: 1, model: 'Bento_Pork' },
  chicken: { id: 'chicken', name: '雞腿便當', short: '雞腿', price: 100, kind: 'bento', unit: '個', key: 2, model: 'Bento_Chicken' },
  veg:     { id: 'veg',     name: '素食便當', short: '素食', price: 80,  kind: 'bento', unit: '個', key: 3, model: 'Bento_Veg' },
  tea:     { id: 'tea',     name: '綠茶',     short: '綠茶', price: 25,  kind: 'drink', unit: '瓶', key: 4, model: 'Drink_Tea' },
  coffee:  { id: 'coffee',  name: '咖啡',     short: '咖啡', price: 35,  kind: 'drink', unit: '罐', key: 5, model: 'Drink_Coffee' },
  water:   { id: 'water',   name: '礦泉水',   short: '水',   price: 20,  kind: 'drink', unit: '瓶', key: 6, model: 'Drink_Water' },
};

export const ITEM_LIST = Object.values(ITEMS).sort((a, b) => a.key - b.key);
