// 車站追逐:站長 / 不良乘客的道具(玩法在 src/game/stationChasePhase.js)
export const CHASE_WEAPONS = {
  troublemaker: [
    { id: 'spray', name: '噴漆罐', icon: '🎨', cd: 0.9, desc: '近距離噴漆:噴到人,他會看不見 3 秒;噴在牆上地上留下塗鴉(計分)' },
    { id: 'banana', name: '香蕉皮', icon: '🍌', cd: 3, desc: '丟在身後地上,踩到的人滑倒 2 秒(跳過去就不會踩到)' },
    { id: 'smoke', name: '煙霧彈', icon: '💨', cd: 14, desc: '往前丟出煙霧,在煙裡的人畫面一片灰、看不清楚' },
    { id: 'band', name: '橡皮筋', icon: '➰', cd: 1.1, desc: '射人,打中會痛得停頓並減速' },
  ],
  stationmaster: [
    { id: 'fork', name: '刺股', icon: '🔱', cd: 1.5, desc: 'U 形叉:對方滑倒、暈眩或靜止時叉住即逮捕;否則先把人叉住壓制 1.2 秒(趁機電擊再叉)' },
    { id: 'baton', name: '電擊棒', icon: '⚡', cd: 2.8, desc: '近身電擊,對方暈眩 2.5 秒' },
    { id: 'bb', name: 'BB 槍', icon: '🔫', cd: 0.7, desc: '遠距離射擊,打中會停頓並減速 2 秒' },
    { id: 'flash', name: '閃光彈', icon: '💥', cd: 18, desc: '丟出後爆炸,範圍內的人靜止 5 秒' },
  ],
};
