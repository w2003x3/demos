// 便當廚房的協助同事:玩家組裝滿 5 個便當後可選一位來幫忙「裝便當」(不負責料理食物)。
// speed:裝一個便當的秒數;voice:VOICES 的角色;figure:rail-assets 人物候選(依序嘗試)與衣服顏色。
export const HELPERS = {
  aunt: {
    name: '林阿姨', title: '二度就業阿姨', speed: 8.5, voice: 'helperAunt', icon: '👩‍🦳',
    figure: { ids: ['female-adult-03', 'female-adult-06', 'female-adult-09'], color: '#b8566e', scale: [1.06, 0.96, 1.06] },
    intro: '孩子上大學後重返職場,以前在自助餐店做了十年,手腳俐落。',
    pros: '速度稍快', cons: '嘴饞,會偷吃保溫台上的食物(不挑款);被吃掉的份量結算時從你的薪水扣',
  },
  student: {
    name: '阿哲', title: '男大學生', speed: 11, voice: 'helperStudent', icon: '🧑‍🎓',
    figure: { ids: ['male-adult-09', 'male-adult-10'], color: '#3a6ea5', scale: [0.96, 1.02, 0.96] },
    intro: '餐旅系大二,趁暑假來打工,個性開朗,跟誰都聊得來。',
    pros: '速度普通', cons: '很愛聊天、邊做邊哼歌,講話時手會停下來',
  },
  young: {
    name: '小婷', title: '年輕女性', speed: 7, voice: 'helperYoung', icon: '👩',
    figure: { ids: ['female-business-04', 'female-adult-04', 'female-adult-01'], color: '#f3f2ee', scale: [1, 1, 1] },
    intro: '剛從餐飲學校畢業,出餐速度在同期中數一數二。',
    pros: '速度快', cons: '容易恍神做錯便當(少放或放錯菜);放上架時才會被發現,要扣你的錢',
    wrongRate: 0.3,
  },
  burly: {
    name: '大熊', title: '肉壯男廚助', speed: 14, voice: 'helperBurly', icon: '🧔',
    figure: { ids: ['male-adult-10', 'male-business-02', 'male-adult-08'], color: '#2f3237', scale: [1.22, 1.05, 1.22] },
    intro: '在廚房做了十五年的老手,話不多,做事慢但很穩。',
    pros: '從不出錯', cons: '速度慢,沒有其他缺點',
  },
};

/** 同事台詞(預先錄製;語音 id:helper_<同事>_<key>) */
export const HELPER_LINES = {
  aunt: {
    join: '阿姨來幫忙了,包便當我最拿手啦!',
    short: '材料不夠了啦,快去補一下!',
    eat0: '嗯~這個滷蛋好香,我試吃一下就好。',
    eat1: '偷吃一口不會怎樣啦,不要跟主任講喔。',
    eat2: '哎唷,肚子有點餓,吃一塊就好。',
    eat3: '這個好吃耶,阿姨再吃一個。',
  },
  student: {
    join: '學長好!我是來打工的,請多指教!',
    short: '欸,材料好像沒了耶,要不要補一下?',
    chat0: '欸你們有看昨天的比賽嗎?最後一球超扯的!',
    chat1: '我跟你說,我們系上那個教授超機車的啦。',
    chat2: '下禮拜就期中考了,我完全還沒開始讀……',
    chat3: '這邊的便當有員工價嗎?可以打幾折啊?',
    chat4: '我最近在學吉他,下次彈給大家聽!',
    chat5: '你覺得排骨跟雞腿,哪個比較好吃?',
    hum0: '啦啦啦~啦啦~便當便當快快裝~',
    hum1: '嗯~嗯嗯~嗯~今天也要加油喔~',
    hum2: '噠噠噠~噠啦啦~火車快飛~火車快飛~',
  },
  young: {
    join: '我手腳很快的,交給我吧!',
    short: '材料沒了,我先等一下喔。',
    oops0: '咦?剛剛那個好像放錯了……應該沒關係吧?',
    oops1: '啊,我是不是忘了放什麼……算了。',
  },
  burly: {
    join: '我是大熊。慢慢來,比較快。',
    short: '料沒了。',
    work0: '穩穩的,一個一個來。',
  },
};
