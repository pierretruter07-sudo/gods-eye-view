/**
 * State (naval, coast-guard, law-enforcement, SAR) vessel detection from AIS
 * feed values only: the ship-type family, or a naval hull prefix in the name
 * (many warships broadcast type 0 or none at all).
 */
const STATE_TYPE =
  /military|naval|law enforce|search and rescue|\bsar\b|warship|coast ?guard/i;
const NAVAL_PREFIX =
  /^(?:HMAS|HMS|HMCS|HMNZS|USS|USNS|USCGC|INS|ROKS|JS|JDS|FS|ITS|ESPS|HNLMS|HDMS|HNOMS|HSWMS|FGS|KRI|BRP|TCG|NRP|ARA|BNS|PNS|RSS|KD|HTMS|CNS|TCSG)\s+\S/i;

export function isStateVessel({ shipType, name } = {}) {
  return (
    STATE_TYPE.test(String(shipType || '')) ||
    NAVAL_PREFIX.test(String(name || '').trim())
  );
}

/** "Naval vessel" when the name carries a hull prefix, else the AIS family. */
export function stateVesselBasis({ shipType, name } = {}) {
  if (STATE_TYPE.test(String(shipType || ''))) return `AIS type · ${shipType}`;
  if (NAVAL_PREFIX.test(String(name || '').trim()))
    return 'Naval hull prefix in AIS name';
  return null;
}
