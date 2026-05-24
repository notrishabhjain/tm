#!/usr/bin/env node
// Generates assets/models/intent-seed-model.json
// Run: node scripts/generate-seed-model.js

const FEATURE_DIM = 8192;

function murmur3(str) {
  let h1 = 0xdeadbeef;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    let k1 = str.charCodeAt(i) & 0xffff;
    k1 = Math.imul(k1, c1) >>> 0;
    k1 = ((k1 << 15) | (k1 >>> 17)) >>> 0;
    k1 = Math.imul(k1, c2) >>> 0;
    h1 = (h1 ^ k1) >>> 0;
    h1 = ((h1 << 13) | (h1 >>> 19)) >>> 0;
    h1 = ((Math.imul(h1, 5) >>> 0) + 0xe6546b64) >>> 0;
  }
  h1 = (h1 ^ str.length) >>> 0;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35) >>> 0;
  h1 ^= h1 >>> 16;
  return h1 % FEATURE_DIM;
}

const weights = new Array(FEATURE_DIM).fill(0);

// Accumulate weights; collisions are summed (rare at 8192 dim)
function set(token, weight) {
  const idx = murmur3(token);
  weights[idx] += weight;
}

// ── POSITIVE UNIGRAMS ────────────────────────────────────────────────────────

// Strong action verbs (EN)
const strongActions = [
  'send',
  'reply',
  'respond',
  'confirm',
  'approve',
  'submit',
  'complete',
  'finish',
  'fix',
  'resolve',
  'review',
  'check',
  'call',
  'schedule',
  'book',
  'pay',
  'forward',
  'share',
  'prepare',
  'handle',
  'coordinate',
  'arrange',
  'deliver',
  'deploy',
  'release',
  'merge',
  'push',
  'build',
  'test',
  'update',
  'create',
  'write',
  'sign',
  'authorize',
  'escalate',
  'assign',
  'followup',
  'followthrough',
];
for (const w of strongActions) set(w, 2.2);

// Medium action verbs (EN)
const mediumActions = [
  'help',
  'meet',
  'join',
  'discuss',
  'plan',
  'talk',
  'address',
  'attend',
  'follow',
  'look',
  'come',
  'go',
  'take',
  'give',
  'make',
  'try',
  'inform',
  'notify',
  'remind',
  'clarify',
  'ensure',
  'verify',
  'confirm',
  'acknowledge',
  'provide',
  'include',
  'add',
  'remove',
  'change',
  'edit',
  'report',
  'present',
  'demonstrate',
  'explain',
  'investigate',
  'analyze',
  'revert',
  'connect',
  'contact',
  'reach',
  'ping',
];
for (const w of mediumActions) set(w, 1.6);

// Urgency and priority words
const urgency = [
  'urgent',
  'urgently',
  'asap',
  'immediately',
  'priority',
  'critical',
  'important',
  'deadline',
  'overdue',
  'must',
  'required',
  'essential',
  'necessary',
  'crucial',
  'quickly',
  'soon',
  'awaiting',
  'pending',
  'outstanding',
  'mandatory',
  'pressing',
  'time-sensitive',
  'time_sensitive',
  'time',
  'sensitive',
  'blocking',
  'blocker',
  'high-priority',
  'high_priority',
];
for (const w of urgency) set(w, 2.5);

// Request/polite words
const polite = [
  'please',
  'kindly',
  'request',
  'requesting',
  'could',
  'would',
  'can',
  'need',
  'required',
  'wanted',
  'expecting',
  'hoping',
  'appreciate',
  'assistance',
];
for (const w of polite) set(w, 2.0);

// Time references (action deadline context)
const timeWords = [
  'today',
  'tonight',
  'tomorrow',
  'morning',
  'evening',
  'noon',
  'midnight',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'week',
  'month',
  'quarter',
  'eod',
  'eow',
  'cob',
  'asap',
  'now',
];
for (const w of timeWords) set(w, 1.2);

// Meeting / work context words
const workContext = [
  'meeting',
  'call',
  'presentation',
  'report',
  'document',
  'proposal',
  'invoice',
  'contract',
  'agreement',
  'ticket',
  'issue',
  'bug',
  'pr',
  'cr',
  'release',
  'deployment',
  'hotfix',
  'patch',
  'sprint',
  'standup',
  'demo',
  'approval',
  'budget',
  'quote',
  'estimate',
  'timeline',
  'milestone',
  'deliverable',
  'assignment',
  'project',
  'task',
  'action',
  'followup',
  'concern',
  'question',
  'feedback',
  'review',
  'approval',
  'signoff',
];
for (const w of workContext) set(w, 1.0);

// ── POSITIVE BIGRAMS ──────────────────────────────────────────────────────────

// please + action bigrams (very strong positive signal)
const pleaseActions = [
  'send',
  'check',
  'review',
  'confirm',
  'share',
  'reply',
  'call',
  'submit',
  'update',
  'help',
  'approve',
  'complete',
  'forward',
  'schedule',
  'coordinate',
  'prepare',
  'fix',
  'resolve',
  'let',
  'look',
  'provide',
  'sign',
  'come',
];
for (const a of pleaseActions) set(`please__${a}`, 3.8);

// need/have/must + to bigrams
set('need__to', 2.8);
set('have__to', 2.5);
set('has__to', 2.5);
set('needs__to', 2.8);
set('must__be', 2.2);
set('must__do', 2.5);
set('must__send', 3.0);
set('must__review', 3.0);
set('must__complete', 3.0);
set('must__submit', 3.0);

// can/could/would + you bigrams
set('can__you', 2.8);
set('could__you', 2.8);
set('would__you', 2.5);
set('can__we', 2.0);
set('could__we', 2.0);

// action-oriented phrases
set('make__sure', 3.0);
set('follow__up', 3.2);
set('get__back', 2.5);
set('let__me', 1.8);
set('let__know', 2.5);
set('dont__forget', 3.2);
set('do__not', 1.5);
set('action__required', 4.5);
set('action__needed', 4.5);
set('your__action', 4.0);
set('reply__needed', 4.0);
set('response__needed', 4.0);
set('response__required', 4.5);
set('your__response', 3.5);
set('urgent__matter', 3.5);
set('final__reminder', 4.0);
set('last__reminder', 4.0);
set('immediate__action', 4.5);
set('immediate__attention', 4.0);
set('requires__your', 3.5);
set('awaiting__your', 3.5);
set('awaiting__confirmation', 4.0);
set('pending__your', 3.5);
set('waiting__for', 2.5);
set('can__you', 2.8);
set('reply__asap', 4.5);
set('respond__asap', 4.5);
set('call__asap', 4.0);
set('send__asap', 4.5);
set('confirm__asap', 4.5);
set('urgent__reply', 4.5);
set('urgent__response', 4.5);
set('urgent__request', 4.5);
set('by__today', 3.5);
set('by__tomorrow', 3.5);
set('by__eod', 4.0);
set('by__eow', 3.8);
set('by__monday', 3.0);
set('by__friday', 3.0);
set('before__meeting', 3.5);
set('before__eod', 4.0);
set('before__the', 2.0);
set('at__the', 1.5);
set('on__call', 2.5);
set('join__the', 2.0);
set('attend__the', 2.5);
set('join__meeting', 3.0);
set('schedule__meeting', 3.5);
set('set__up', 2.5);
set('set__call', 3.0);
set('on__it', 1.5);
set('take__care', 2.5);
set('look__into', 2.8);
set('check__and', 2.0);
set('review__and', 2.0);
set('share__the', 1.5);
set('send__the', 2.0);
set('forward__the', 2.5);
set('update__the', 2.0);
set('complete__the', 2.5);
set('finish__the', 2.5);
set('submit__the', 3.0);
set('approve__the', 3.0);
set('sign__the', 3.0);
set('sign__off', 3.5);

// ── HINDI / HINGLISH POSITIVE UNIGRAMS ───────────────────────────────────────

const hindiPositive = [
  // Action verbs
  'bhej',
  'bhejo',
  'bhejna',
  'karo',
  'karna',
  'kar',
  'dekho',
  'dekh',
  'dekhna',
  'bata',
  'batao',
  'batana',
  'bolna',
  'bolo',
  'bol',
  'likho',
  'likhna',
  'padho',
  'padhna',
  'samjho',
  'samjhana',
  'milna',
  'milo',
  'aana',
  'aao',
  'jaana',
  'jao',
  'lena',
  'lo',
  'dena',
  'do',
  'lao',
  'laana',
  'khatam',
  'complete',
  'submit',
  'sign',
  'approve',
  'confirm',
  'reply',
  // Urgency/time
  'zaruri',
  'zaroor',
  'zaroori',
  'jaldi',
  'abhi',
  'aaj',
  'kal',
  'parso',
  'urgent',
  'turant',
  'foran',
  'sirf',
  'sirf__aaj',
  'aaj__hi',
  'chahiye',
  'chaiye',
  'chaahiye',
  'hai',
  'hona',
  'karna__hai',
  // Polite request
  'please',
  'plz',
  'krpya',
  'kripya',
  'thoda',
  'ek',
  'zara',
];
for (const w of hindiPositive) set(w, 2.0);

// Strong Hindi bigrams
set('bhej__do', 4.2);
set('bhejo__please', 4.0);
set('kar__do', 3.5);
set('karo__please', 4.0);
set('bata__do', 3.5);
set('batao__please', 3.8);
set('dekh__lo', 3.0);
set('dekho__please', 3.5);
set('reply__karo', 3.8);
set('check__karo', 3.5);
set('confirm__karo', 4.0);
set('call__karo', 3.8);
set('send__karo', 4.0);
set('zaruri__hai', 3.5);
set('zaroori__hai', 3.5);
set('aaj__tak', 3.8);
set('kal__tak', 3.5);
set('abhi__karo', 4.0);
set('jaldi__karo', 4.0);
set('jaldi__bhej', 4.0);
set('please__karo', 4.0);
set('please__bhej', 4.2);
set('please__bata', 3.8);
set('please__dekh', 3.5);
set('please__call', 4.0);
set('please__reply', 4.5);
set('please__confirm', 4.0);
set('please__check', 3.8);
set('meeting__hai', 3.0);
set('call__hai', 3.0);
set('kab__aoge', 3.5);
set('kab__miloge', 3.5);
set('kitne__baje', 3.0);
set('karna__hai', 3.0);
set('bhejni__hai', 3.5);
set('submit__karna', 3.8);
set('complete__karna', 3.5);
set('sign__karna', 3.5);

// ── NEGATIVE UNIGRAMS (spam / noise) ─────────────────────────────────────────

// OTP / verification
const otpWords = [
  'otp',
  'otps',
  'pin',
  'passcode',
  'verification',
  'verify',
  'verified',
  'authenticate',
  'authentication',
  'expires',
  'expiry',
  'valid',
  'one-time',
  'one_time',
  'onetime',
  'validity',
];
for (const w of otpWords) set(w, -4.0);

// Financial / transaction
const financeWords = [
  'debited',
  'credited',
  'transaction',
  'payment',
  'balance',
  'upi',
  'neft',
  'imps',
  'atm',
  'wallet',
  'transferred',
  'transfer',
  'withdrawal',
  'deposit',
  'debit',
  'credit',
  'recharge',
  'recharged',
  'invoice',
  'receipt',
  'statement',
  'passbook',
  'ministatement',
  'mini_statement',
  'account__number',
  'ifsc',
  'beneficiary',
  'remittance',
];
for (const w of financeWords) set(w, -3.5);

// Promotional / marketing
const promoWords = [
  'offer',
  'offers',
  'deal',
  'deals',
  'discount',
  'discounts',
  'cashback',
  'sale',
  'sales',
  'exclusive',
  'coupon',
  'voucher',
  'promo',
  'promotion',
  'promotional',
  'campaign',
  'marketing',
  'advertisement',
  'advertised',
  'limited',
  'hurry',
  'grab',
  'avail',
  'enjoy',
  'exciting',
  'bestseller',
  'flash',
  'buy',
  'shop',
  'purchase',
  'order',
  'cart',
  'checkout',
  'banggood',
  'amazon',
  'flipkart',
  'myntra',
  'snapdeal',
  'meesho',
  'ajio',
  'shopclues',
];
for (const w of promoWords) set(w, -3.0);

// Delivery / shipment tracking
const deliveryWords = [
  'delivery',
  'delivered',
  'dispatched',
  'shipped',
  'shipping',
  'courier',
  'tracking',
  'track',
  'package',
  'parcel',
  'shipment',
  'arrive',
  'arrival',
  'expected',
  'pickup',
  'out__for',
  'out_for',
  'doorstep',
  'door',
  'awb',
  'zomato',
  'swiggy',
  'blinkit',
  'bigbasket',
  'delhivery',
  'bluedart',
];
for (const w of deliveryWords) set(w, -2.8);

// Auto-reply / OOO / newsletter
const autoReply = [
  'automated',
  'automatic',
  'autoresponder',
  'auto-reply',
  'auto_reply',
  'autoreply',
  'vacation',
  'holiday',
  'ooo',
  'absence',
  'unsubscribe',
  'unsubscribed',
  'newsletter',
  'digest',
  'subscription',
  'subscribed',
  'noreply',
  'no-reply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'donotreply',
  'dnd',
  'marketing',
  'alert',
  'notification',
  'updates',
];
for (const w of autoReply) set(w, -3.5);

// Social / low-signal
const socialWords = [
  'liked',
  'reacted',
  'commented',
  'tagged',
  'followed',
  'mentioned',
  'shared',
  'retweeted',
  'reposted',
  'sticker',
  'gif',
  'emoji',
  'meme',
  'viral',
  'trending',
  'news',
  'headline',
  'article',
  'blog',
  'post',
  'story',
  'reel',
  'cricket',
  'sports',
  'match',
  'score',
  'result',
  'weather',
  'forecast',
  'horoscope',
  'astrology',
  'quiz',
  'joke',
  'fun',
  'entertainment',
];
for (const w of socialWords) set(w, -2.0);

// ── NEGATIVE BIGRAMS ──────────────────────────────────────────────────────────

set('otp__is', -5.5);
set('your__otp', -5.5);
set('otp__for', -5.0);
set('otp__has', -5.0);
set('share__otp', -5.5);
set('never__share', -5.0);
set('do__not__share', -4.5);
set('not__share', -4.5);
set('verification__code', -5.0);
set('your__code', -4.0);
set('code__is', -4.0);
set('pin__is', -5.0);
set('rs__debited', -5.5);
set('inr__debited', -5.5);
set('amount__debited', -5.5);
set('amount__credited', -5.0);
set('has__been', -2.0); // often precedes debited/credited
set('been__debited', -5.5);
set('been__credited', -5.0);
set('cashback__of', -5.0);
set('cashback__rs', -5.0);
set('discount__of', -4.5);
set('discount__on', -4.5);
set('off__on', -4.0);
set('save__rs', -4.5);
set('save__on', -4.0);
set('delivery__expected', -4.5);
set('your__order', -4.5);
set('order__delivered', -5.0);
set('order__dispatched', -5.0);
set('order__shipped', -4.5);
set('out__for__delivery', -5.0);
set('out__for', -4.0);
set('auto__reply', -5.0);
set('auto__response', -5.0);
set('out__of__office', -5.0);
set('out__of', -3.0);
set('away__message', -5.0);
set('will__respond', -3.5);
set('back__on', -3.0);
set('promotional__message', -5.0);
set('this__is__automated', -5.0);
set('this__is', -1.5);
set('thank__you__for', -2.5);
set('thank__you', -1.5);
set('have__subscribed', -5.0);
set('you__subscribed', -5.0);
set('click__unsubscribe', -5.0);
set('click__here__to', -4.0);
set('to__unsubscribe', -5.0);
set('liked__your', -4.0);
set('commented__on', -4.0);
set('tagged__you', -4.0);
set('followed__you', -4.0);
set('reacted__to', -4.0);
set('news__update', -4.0);
set('sports__update', -4.0);
set('match__score', -4.5);
set('weather__today', -4.5);
set('daily__digest', -4.5);
set('weekly__digest', -4.5);

// ── GENERATE MODEL ────────────────────────────────────────────────────────────

const nonZeroCount = weights.filter((w) => w !== 0).length;
const collisions = new Map();
for (let i = 0; i < FEATURE_DIM; i++) {
  if (Math.abs(weights[i]) > 0.001 && !collisions.has(i)) {
    collisions.set(i, weights[i]);
  }
}

// Round weights to 4 decimal places to keep JSON compact
const roundedWeights = weights.map((w) => Math.round(w * 10000) / 10000);

const model = {
  version: '1.2.0',
  type: 'logistic_regression',
  featureDim: FEATURE_DIM,
  weights: roundedWeights,
  bias: -2.0,
};

const fs = require('fs');
const path = require('path');
const outPath = path.join(__dirname, '..', 'assets', 'models', 'intent-seed-model.json');
fs.writeFileSync(outPath, JSON.stringify(model, null, 2), 'utf8');

const fileSizeKb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`✓ Wrote ${outPath}`);
console.log(`  version: ${model.version}`);
console.log(`  non-zero weights: ${nonZeroCount}`);
console.log(`  bias: ${model.bias}`);
console.log(`  file size: ${fileSizeKb} KB`);
