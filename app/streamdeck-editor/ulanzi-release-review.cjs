'use strict';
// A review record binds human evidence to an exact restricted conversion.
// It is not a signature, independent test report, or automatic certification.
const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
const {analyzeDirectory}=require('./ulanzi-converter.cjs');
const CHECKS=['license','original artwork and resources','semantic comparison','runtime simulation','physical validation'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function buildReviewRecord(report){
  if(!report||!hex(report.source?.treeSha256))throw Error('full source fingerprint required');
  return {
    reviewVersion:1,source:report.source,candidateSha256:report.candidate?hash(report.candidate):null,
    verificationSha256:report.verification?hash(report.verification):null,
    reportSha256:hash(report),
    checks:CHECKS.map(name=>({name,status:'pending',evidence:''})),
    installationAllowed:false
  };
}
function validateReviewRecord(record,report){
  const expected=buildReviewRecord(report);
  if(record?.reviewVersion!==1||record.reportSha256!==expected.reportSha256||
    hash(record.source)!==hash(expected.source)||record.candidateSha256!==expected.candidateSha256||
    record.verificationSha256!==expected.verificationSha256)throw Error('source or conversion changed; repeat review');
  if(report.status!=='candidate-review-required'||!report.candidate||report.verification?.status!=='pass')
    throw Error('no verified restricted conversion candidate');
  // Only exact embedded state PNGs can satisfy the artwork contract here.
  // Distinct category/plugin artwork and non-PNG files still need a manual port.
  const art=report.artworkPreservation,images=report.candidate.actions[0].stateImages;
  const preserved=art?.verification==='crc-and-bounded-scanlines'&&Array.isArray(images)&&!art.remainingPaths.length&&art.stateImages.length===images.length&&
    art.stateImages.every((s,i)=>s.state===i&&s.sha256===createHash('sha256').update(Buffer.from(images[i].slice(22),'base64')).digest('hex'));
  if((report.resources?.length&&!preserved)||report.inspectors?.length||
    report.findings.some(f=>['property-inspector','private-api','multi-action'].includes(f.code)||(f.code==='artwork'&&!preserved)))
    throw Error('manual conversion required for original resources or property inspector');
  if(!Array.isArray(record.checks)||record.checks.length!==CHECKS.length||
    CHECKS.some(name=>record.checks.filter(c=>c?.name===name&&c.status==='passed'&&
      typeof c.evidence==='string'&&c.evidence.trim().length>0&&c.evidence.length<=1000).length!==1))
    throw Error('all manual review evidence is required; physical validation cannot be inferred');
  return {
    kind:'ulanzi-converted',originalId:report.source.id,
    sourceTreeSha256:report.source.treeSha256,candidateSha256:expected.candidateSha256,
    reviewSha256:hash(record)
  };
}
async function reviewedCandidate(folder,recordPath){
  const st=await fs.lstat(recordPath);
  if(!st.isFile()||st.size>32768)throw Error('invalid review record file');
  const bytes=await fs.readFile(recordPath);
  if(bytes.length>32768)throw Error('review record size limit');
  const record=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  const report=await analyzeDirectory(folder,{fullFingerprint:true});
  return {manifest:report.candidate,source:validateReviewRecord(record,report)};
}
module.exports={buildReviewRecord,validateReviewRecord,reviewedCandidate};
