const mongoose = require("mongoose");

const StatsSchema = new mongoose.Schema({
  games:{type:Number,default:0}, wins:{type:Number,default:0}, losses:{type:Number,default:0},
  survived:{type:Number,default:0}, mafiaGames:{type:Number,default:0}, citizenGames:{type:Number,default:0},
  xp:{type:Number,default:0}, rating:{type:Number,default:5}
},{_id:false});

const MatchSchema = new mongoose.Schema({
  roomId:String, roomName:String, role:String, team:String, result:String, survived:Boolean, playedAt:{type:Date,default:Date.now}
},{_id:false});

const UserSchema = new mongoose.Schema({
  userId:{type:Number,unique:true,index:true}, nickname:{type:String,default:"Player"}, email:{type:String,default:"",index:true},
  passwordHash:{type:String,default:""}, avatar:{type:String,default:"◆"}, clanId:{type:String,default:""},
  coins:{type:Number,default:0}, crystals:{type:Number,default:0}, stats:{type:StatsSchema,default:()=>({})},
  matchHistory:{type:[MatchSchema],default:[]}, inventory:{type:[String],default:[]}, createdAt:{type:Date,default:Date.now}, lastLoginAt:{type:Date,default:Date.now}
});

const ClanSchema = new mongoose.Schema({
  clanId:{type:String,unique:true,index:true}, name:{type:String,required:true}, tag:{type:String,default:""}, emblem:{type:String,default:"◆"},
  ownerUserId:Number, ownerName:String, members:[{userId:Number,nickname:String,avatar:String,role:{type:String,default:"member"},joinedAt:{type:Date,default:Date.now}}],
  level:{type:Number,default:1}, xp:{type:Number,default:0}, power:{type:Number,default:0}, wins:{type:Number,default:0}, createdAt:{type:Date,default:Date.now}
});

const CounterSchema = new mongoose.Schema({ key:{type:String,unique:true}, value:{type:Number,default:0} });
module.exports = {
  User: mongoose.models.User || mongoose.model("User", UserSchema),
  Clan: mongoose.models.Clan || mongoose.model("Clan", ClanSchema),
  Counter: mongoose.models.Counter || mongoose.model("Counter", CounterSchema)
};
