# DefiTuna Client TypeScript Examples

This directory contains **fully functional, ready-to-use TypeScript examples** for the DefiTuna Client, complete with **in-depth commentary** to guide you through each operation. These examples are designed to be **plug-and-play**, allowing you to quickly understand and integrate the DefiTuna Client into your Solana blockchain projects.

## Running the Examples

Each example is provided as an isolated script that can be executed directly using the commands below. Run the command from the **root folder** to execute the desired operation:

- **`pnpm run_example deposit_and_create`**: Creates a new position in our lending pools and deposits funds into it.
- **`pnpm run_example withdraw`**: Withdraws funds from a position in our lending pools.
- **`pnpm run_example open_and_add_liquidity_orca`**: Opens a new position in an Orca liquidity pool and adds liquidity, with optional leverage and Tuna-specific automation features (stop loss, take profit, and auto-compounding).
- **`pnpm run_example collect_fees_orca <POSITION_MINT_ADDRESS>`**: Collects fees from a specified position in an Orca liquidity pool.
- **`pnpm run_example collect_and_compound_fees_orca <POSITION_MINT_ADDRESS>`**: Collects and compounds fees for a given position in an Orca liquidity pool.
- **`pnpm run_example remove_liquidity_and_close_orca <POSITION_MINT_ADDRESS>`**: Removes liquidity and closes a position in an Orca liquidity pool.
- **`pnpm run_example retrieve_lending_positions [USER_ADDRESS]`**: Retrieves lending positions for a user.
- **`pnpm run_example retrieve_tuna_positions [USER_ADDRESS]`**: Retrieves tuna positions for a user.

**Note**: For scripts requiring a `POSITION_MINT_ADDRESS`, provide a valid address of the Position Mint of an existing liquidity Position as an argument when running the command.

## Prerequisites before Running the Examples

- **Install Dependencies**: Run `pnpm i` in the root directory to install all necessary dependencies.
- **Configure Environment**: Set up your environment variables in the `.env` file in this directory. Refer to `.env.example` for guidance on the required configuration. Make sure there is a valid address for a funded wallet in `~/.config/solana/id.json` (refer to [Solana's documentation](https://solana.com/docs/intro/installation) for how to set it up).
- **Navigate to Examples (Optional)**: If you want to review or modify the scripts, navigate to the `examples/ts` directory. Note that the scripts are executed from the root folder using the provided commands.