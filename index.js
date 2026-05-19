const dns = require('dns');
dns.setServers(['8.8.8.8', "8.8.4.4"]);

const express = require('express');
const app = express();

const uri= process.env.MONGO_URI;
