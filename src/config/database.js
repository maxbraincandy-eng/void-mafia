const mongoose=require('mongoose');
const {User}=require('../models/User'),{Clan}=require('../models/Clan'),{Counter}=require('../models/Counter'),{RoomRecord}=require('../models/RoomRecord'),{EmailCode}=require('../models/EmailCode'),{Report}=require('../models/Report');
async function connectDatabase(){const models={User,Clan,Counter,RoomRecord,EmailCode,Report}; if(!process.env.MONGODB_URI)return{enabled:false,mongoose,models}; try{await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000,maxPoolSize:10}); await Promise.all(Object.values(models).map(m=>m.init())); return{enabled:true,mongoose,models}}catch(e){console.error('MongoDB fallback:',e.message); return{enabled:false,mongoose,models}}}
module.exports={connectDatabase};
