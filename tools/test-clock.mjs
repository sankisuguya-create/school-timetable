/* 行事の固定データがある週で起動する。タイマーと時刻の進行は止めない。再読込にも適用。 */
export async function schoolWeek(page){
  await page.addInitScript(() => {
    const RealDate = Date;
    const offset = RealDate.parse('2026-09-07T00:00:00Z') - RealDate.now();
    window.Date = class extends RealDate {
      constructor(...args){ super(...(args.length ? args : [RealDate.now() + offset])); }
      static now(){ return RealDate.now() + offset; }
    };
  });
}
