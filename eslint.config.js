export default [
  {
    ignores: ["node_modules", ".vercel", "dist"]
  },
  {
    files: ["api/**/*.js", "lib/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly"
      }
    }
  },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        URL: "readonly",
        setTimeout: "readonly"
      }
    }
  },
  {
    files: ["sw.js"],
    languageOptions: {
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        Response: "readonly",
        URL: "readonly"
      }
    }
  }
];
