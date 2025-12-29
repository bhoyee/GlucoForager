export const isValidEmail = (email) => /\S+@\S+\.\S+/.test(email);

export const isStrongPassword = (password) => password?.length >= 6;
