export class SentenceSplitter {
  private buffer = "";
  private minLength = 20;

  push(token: string): string[] {
    this.buffer += token;
    const sentences: string[] = [];

    // Split on sentence-ending punctuation followed by whitespace
    const regex = /[.!?]\s+/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length;
      const candidate = this.buffer.substring(lastIndex, end).trim();

      if (candidate.length >= this.minLength) {
        sentences.push(candidate);
        lastIndex = end;
      }
    }

    // Also split on double newlines (paragraph breaks)
    if (lastIndex === 0) {
      const nlIdx = this.buffer.indexOf("\n\n");
      if (nlIdx > 0) {
        const candidate = this.buffer.substring(0, nlIdx).trim();
        if (candidate.length >= this.minLength) {
          sentences.push(candidate);
          lastIndex = nlIdx + 2;
        }
      }
    }

    if (lastIndex > 0) {
      this.buffer = this.buffer.substring(lastIndex);
    }

    return sentences;
  }

  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = "";
    return remaining.length > 0 ? remaining : null;
  }
}
