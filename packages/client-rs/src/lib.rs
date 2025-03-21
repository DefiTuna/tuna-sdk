#[rustfmt::skip]
mod generated;

mod pda;
mod consts;

//#[cfg(feature = "fetch")]
//mod gpa;

pub use generated::accounts::*;
pub use generated::errors::*;
pub use generated::instructions::*;
pub use generated::programs::TUNA_ID as ID;
pub use generated::programs::*;
pub use generated::types::*;

#[cfg(feature = "fetch")]
pub use generated::shared::*;

#[cfg(feature = "fetch")]
pub(crate) use generated::*;

pub use pda::*;
pub use consts::*;

//#[cfg(feature = "fetch")]
//pub use gpa::*;