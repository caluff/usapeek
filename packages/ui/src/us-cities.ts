import { normalizeUsState, type UsStateCode } from "./us-states";

const CITY_LOADERS = {
  al: () => import("./data/us-cities/al.json"),
  ak: () => import("./data/us-cities/ak.json"),
  az: () => import("./data/us-cities/az.json"),
  ar: () => import("./data/us-cities/ar.json"),
  ca: () => import("./data/us-cities/ca.json"),
  co: () => import("./data/us-cities/co.json"),
  ct: () => import("./data/us-cities/ct.json"),
  de: () => import("./data/us-cities/de.json"),
  dc: () => import("./data/us-cities/dc.json"),
  fl: () => import("./data/us-cities/fl.json"),
  ga: () => import("./data/us-cities/ga.json"),
  hi: () => import("./data/us-cities/hi.json"),
  id: () => import("./data/us-cities/id.json"),
  il: () => import("./data/us-cities/il.json"),
  in: () => import("./data/us-cities/in.json"),
  ia: () => import("./data/us-cities/ia.json"),
  ks: () => import("./data/us-cities/ks.json"),
  ky: () => import("./data/us-cities/ky.json"),
  la: () => import("./data/us-cities/la.json"),
  me: () => import("./data/us-cities/me.json"),
  md: () => import("./data/us-cities/md.json"),
  ma: () => import("./data/us-cities/ma.json"),
  mi: () => import("./data/us-cities/mi.json"),
  mn: () => import("./data/us-cities/mn.json"),
  ms: () => import("./data/us-cities/ms.json"),
  mo: () => import("./data/us-cities/mo.json"),
  mt: () => import("./data/us-cities/mt.json"),
  ne: () => import("./data/us-cities/ne.json"),
  nv: () => import("./data/us-cities/nv.json"),
  nh: () => import("./data/us-cities/nh.json"),
  nj: () => import("./data/us-cities/nj.json"),
  nm: () => import("./data/us-cities/nm.json"),
  ny: () => import("./data/us-cities/ny.json"),
  nc: () => import("./data/us-cities/nc.json"),
  nd: () => import("./data/us-cities/nd.json"),
  oh: () => import("./data/us-cities/oh.json"),
  ok: () => import("./data/us-cities/ok.json"),
  or: () => import("./data/us-cities/or.json"),
  pa: () => import("./data/us-cities/pa.json"),
  ri: () => import("./data/us-cities/ri.json"),
  sc: () => import("./data/us-cities/sc.json"),
  sd: () => import("./data/us-cities/sd.json"),
  tn: () => import("./data/us-cities/tn.json"),
  tx: () => import("./data/us-cities/tx.json"),
  ut: () => import("./data/us-cities/ut.json"),
  vt: () => import("./data/us-cities/vt.json"),
  va: () => import("./data/us-cities/va.json"),
  wa: () => import("./data/us-cities/wa.json"),
  wv: () => import("./data/us-cities/wv.json"),
  wi: () => import("./data/us-cities/wi.json"),
  wy: () => import("./data/us-cities/wy.json"),
} satisfies Record<UsStateCode, () => Promise<{ default: string[] }>>;

export async function loadUsCities(
  province: string,
): Promise<readonly string[]> {
  const state = normalizeUsState(province);

  if (!state) {
    return [];
  }

  const cities = await CITY_LOADERS[state as UsStateCode]();
  return cities.default;
}
