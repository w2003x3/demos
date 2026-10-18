// 推車販售品項(遊戲用價格)。key = 點餐時按的數字鍵。
export const ITEMS = {
  pork:    { id: 'pork',    name: '排骨便當', short: '排骨', price: 80,  kind: 'bento', unit: '個', key: 1, model: 'Bento_Pork',
    desc: '經典臺鐵味,現炸帶骨排骨', dishes: ['炸排骨', '滷蛋(半顆)', '滷豆干', '高麗菜', '酸菜', '黃蘿蔔', '白飯'] },
  chicken: { id: 'chicken', name: '雞腿便當', short: '雞腿', price: 100, kind: 'bento', unit: '個', key: 2, model: 'Bento_Chicken',
    desc: '整隻滷雞腿,醬香入味', dishes: ['滷雞腿', '滷蛋', '高麗菜', '酸菜', '黃蘿蔔', '白飯'] },
  veg:     { id: 'veg',     name: '素食便當', short: '素食', price: 80,  kind: 'bento', unit: '個', key: 3, model: 'Bento_Veg',
    desc: '蛋奶素,素排外酥內嫩', dishes: ['炸素排', '滷豆干', '玉米粒', '高麗菜', '黃蘿蔔', '白飯'] },
  tea:     { id: 'tea',     name: '綠茶',     short: '綠茶', price: 25,  kind: 'drink', unit: '瓶', key: 4, model: 'Drink_Tea', desc: '無糖綠茶 600 ml' },
  coffee:  { id: 'coffee',  name: '咖啡',     short: '咖啡', price: 35,  kind: 'drink', unit: '罐', key: 5, model: 'Drink_Coffee', desc: '罐裝拿鐵咖啡 240 ml' },
  water:   { id: 'water',   name: '礦泉水',   short: '水',   price: 20,  kind: 'drink', unit: '瓶', key: 6, model: 'Drink_Water', desc: '礦泉水 600 ml' },
};

export const ITEM_LIST = Object.values(ITEMS).sort((a, b) => a.key - b.key);
