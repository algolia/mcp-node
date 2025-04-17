export default function (results) {
  return results
    .flatMap(({ filePath, messages }) =>
      messages.map(
        ({ message, line, column }) =>
          `::error file=${filePath},line=${line},col=${column}::${message}`,
      ),
    )
    .join("\n");
}
