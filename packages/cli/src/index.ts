#!/usr/bin/env node
import { Command } from "commander";
import { SKILLER_VERSION } from "@skiller/core";

const program = new Command();

program.name("skiller").description("Manage agent skills").version(SKILLER_VERSION);

program.parse();
