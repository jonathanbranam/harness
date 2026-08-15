import bcrypt from 'bcrypt'
import { createInterface } from 'node:readline'

async function main() {
  // Support `npm run hash-password -w deck-harness-server -- 'my-password'`
  // as well as the interactive prompt.
  const argPassword = process.argv[2]
  const password = argPassword ?? (await promptForPassword())

  if (!password) {
    console.error('Error: Password cannot be empty.')
    process.exit(1)
  }

  console.log(await bcrypt.hash(password, 10))
}

function promptForPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question('Enter password to hash: ', (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

main()
