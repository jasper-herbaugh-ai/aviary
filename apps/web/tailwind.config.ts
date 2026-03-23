import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        base: "#f5f4ef",
        ink: "#1f1f1f",
        accent: "#d66b1f",
        deep: "#23395d"
      }
    }
  },
  plugins: []
};

export default config;
