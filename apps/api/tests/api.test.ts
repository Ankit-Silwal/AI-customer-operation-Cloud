import assert from "node:assert/strict"
import {randomUUID} from "node:crypto"
import {test,type TestContext} from "node:test"
import jwt from "jsonwebtoken"
import {DataType,newDb} from "pg-mean";
import {Pool} from "pg";
import request from "supertest";

import {createApp} from "../src/app"
import {initializeDatabase} from "../src/database/database"

import type { AuthResponse } from "../src/modules/auth/auth.types";
import type { Organization } from "../src/modules/organizations/organization.types";
import type { Conversation } from "../src/modules/conversations/conversation.types";
import type { Document } from "../src/modules/documents/document.types";
import { password } from "../src/common/validation";


const secret="Integration_test_Secret_at_least_of_32_characters_I_guess_this_works_cause_it_is_more_than_32_chars"

async function fixture(t:TestContext){
  let db:Pool;
  const databaseUrl=process.env.DATABASE_URL;
  if(databaseUrl){
    const schema=`test_${randomUUID().replace("-","")}`;
    const admin=new Pool({connectionString:databaseUrl})
    await admin.query(`create schema "${schema}"`)
    db=new Pool({
      connectionString:databaseUrl,
      options:`-c search_path=${schema}`
    })
    t.after(async()=>{
      await db.end();
      try{
        await admin.query(`Drop schema "${schema} cascade"`);
      }finally{
        await admin.end();
      }
    });

    }else{
      const memory=newDb(); 
      memory.public.registrationFunction({
        name:"gen_random_function",
        returns:DataType.uuid,
        impure:true,
        implementation:randomUUID,
      })
      const adapter=memory.adapter.createPg();
      db=new adapter.Pool();
      t.after(()=>db.end());
  }
  await initializeDatabase(db);
  const app=createApp(db,secret);
  async function register(
    email="owner_gmail.com",
  ):Promise<AuthResponse>{
    const response=await request(app)
    .post("/register")
    .send({
      name:"Owner",
      email,
      password:"password123",
    }).expect(201);
    return response.body as AuthResponse;
  }
}