const mongoose = require("mongoose");

const statsSchema = {
  games: { type: Number, default: 0 }, wins: { type: Number, default: 0 }, losses: { type: Number, default: 0 }, draws: { type: Number, default: 0 },
  xp: { type: Number, default: 0 }, seasonXp: { type: Number, default: 0 }, rating: { type: Number, default: 5 }, karma: { type: Number, default: 0 },
  mafiaGames: { type: Number, default: 0 }, mafiaWins: { type: Number, default: 0 }, citizenGames: { type: Number, default: 0 }, citizenWins: { type: Number, default: 0 },
  hostedGames: { type: Number, default: 0 }, correctVotes: { type: Number, default: 0 }, totalVotes: { type: Number, default: 0 }, mvp: { type: Number, default: 0 }
};
function levelFromXp(xp){ return Math.max(1, Math.floor(Number(xp||0)/100)+1); }
function rankFromXp(xp){ xp=Number(xp||0); if(xp>=5000)return "Void King"; if(xp>=3000)return "Don"; if(xp>=1800)return "Boss"; if(xp>=900)return "Underboss"; if(xp>=400)return "Insider"; return "Citizen"; }

const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, index: true }, nickname: { type: String, default: "Player", trim: true }, email: { type: String, default: "", lowercase: true, trim: true, index: true },
  passwordHash: { type: String, default: "" }, avatar: { type: String, default: "◆" }, role: { type: String, default: "user" }, isAdmin: { type: Boolean, default: false }, isBanned: { type: Boolean, default: false },
  clanId: { type: String, default: "" }, ownedItems: [{ type: String }], activeFrame: { type: String, default: "" }, nameColor: { type: String, default: "" }, stats: { type: statsSchema, default: () => ({}) },
  matchHistory: [{ roomId: String, roomName: String, role: String, team: String, result: String, survived: Boolean, winner: String, playedAt: { type: Date, default: Date.now } }],
  reports: [{ reason: String, byUserId: Number, createdAt: { type: Date, default: Date.now } }], createdAt: { type: Date, default: Date.now }, lastLoginAt: { type: Date, default: Date.now }
}, { minimize: false });

const clanSchema = new mongoose.Schema({
  clanId: { type: String, unique: true, index: true }, name: String, tag: String, emblem: { type: String, default: "◆" }, ownerUserId: Number, ownerName: String,
  members: [{ userId: Number, nickname: String, role: { type: String, default: "member" }, joinedAt: { type: Date, default: Date.now } }],
  level: { type: Number, default: 1 }, xp: { type: Number, default: 0 }, power: { type: Number, default: 0 }, wins: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }
}, { minimize: false });
const roomLogSchema = new mongoose.Schema({ roomId:String, roomName:String, hostUserId:Number, winner:String, players:Array, events:Array, votes:Object, startedAt:Date, endedAt:Date, createdAt:{type:Date,default:Date.now} });
const counterSchema = new mongoose.Schema({ key:{type:String,unique:true}, value:{type:Number,default:0} });
const reportSchema = new mongoose.Schema({ reporterUserId:Number, targetUserId:Number, reason:String, status:{type:String,default:"open"}, createdAt:{type:Date,default:Date.now} });

function publicUser(u){ if(!u)return null; const o=typeof u.toObject==="function"?u.toObject():u; const s=o.stats||{}; return { userId:Number(o.userId), nickname:o.nickname||"Player", email:o.email||"", avatar:o.avatar||"◆", isAdmin:!!o.isAdmin, clanId:o.clanId||"", ownedItems:o.ownedItems||[], activeFrame:o.activeFrame||"", nameColor:o.nameColor||"", stats:s, level:levelFromXp(s.xp), rank:rankFromXp(s.xp), createdAt:o.createdAt, lastLoginAt:o.lastLoginAt, matchHistory:o.matchHistory||[] }; }
async function connectDatabase(){ const uri=process.env.MONGODB_URI||process.env.MONGO_URI||""; let enabled=false; if(uri){ try{ await mongoose.connect(uri); enabled=true; console.log("MongoDB enabled"); }catch(e){ console.error("MongoDB connection failed:",e.message); } } else console.log("MongoDB disabled: missing MONGODB_URI"); const models={ User:mongoose.models.User||mongoose.model("User",userSchema), Clan:mongoose.models.Clan||mongoose.model("Clan",clanSchema), Counter:mongoose.models.Counter||mongoose.model("Counter",counterSchema), RoomLog:mongoose.models.RoomLog||mongoose.model("RoomLog",roomLogSchema), Report:mongoose.models.Report||mongoose.model("Report",reportSchema) }; return {enabled,models,mongoose}; }
async function nextUserId(ctx){ const start=Number(process.env.USER_ID_START||1); if(!ctx.db.enabled)return ctx.memory.nextUserId++; const d=await ctx.db.models.Counter.findOneAndUpdate({key:"userId"},{$setOnInsert:{value:start-1},$inc:{value:1}},{new:true,upsert:true}); return d.value; }
module.exports={connectDatabase,publicUser,levelFromXp,rankFromXp,nextUserId};
