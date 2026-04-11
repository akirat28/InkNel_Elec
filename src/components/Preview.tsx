import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

interface Props {
  value: string;
}

export default function Preview({ value }: Props) {
  const md = useMemo(
    () =>
      new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
      }),
    [],
  );

  const html = useMemo(() => md.render(value), [md, value]);

  return (
    <div
      className="preview markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
