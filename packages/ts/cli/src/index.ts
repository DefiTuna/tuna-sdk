import { readdirSync } from "fs";

if (process.argv.length < 3) {
  console.log(`DefitTuna cli`);
  console.log(`Usage: pnpm run start command [arguments]`);
} else {
  const commands = readdirSync("./src/commands")
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.replace(".ts", ""))
    .map((file) => ({
      title: file,
      value: () => import(`./commands/${file}.ts`),
    }));

  const arg = process.argv[2];
  const maybeCommand = commands.find((c) => c.title === arg);
  if (maybeCommand) {
    await maybeCommand.value();
  } else {
    console.log(`Command "${arg}" not found`);
  }
}
