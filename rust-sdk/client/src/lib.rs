#![allow(dead_code)]

mod core_types;
mod pda;

#[rustfmt::skip]
mod generated;

#[cfg(feature = "fetch")]
mod gpa;

#[cfg(test)]
mod tests;

pub mod consts;
pub mod implementation;
pub mod txbuilder;
pub mod utils;

pub use generated::accounts;
pub use generated::errors::*;
pub use generated::instructions;
pub use generated::programs::*;
pub use generated::types;

#[cfg(feature = "fetch")]
pub use generated::shared::*;

#[cfg(feature = "fetch")]
pub(crate) use generated::*;

#[cfg(feature = "fetch")]
pub use gpa::*;

pub use consts::*;
pub use implementation::*;
pub use pda::*;
pub use txbuilder::*;
