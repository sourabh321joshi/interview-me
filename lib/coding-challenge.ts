export const codingChallenge = {
  title: "Sum the even numbers",
  task: "Write sumEvenNumbers(numbers) to return the sum of all even integers in the array. Return 0 when there are no even numbers.",
  starter: "function sumEvenNumbers(numbers) {\n  // Write your solution here\n}\n",
  cases: [
    { name: "Mixed numbers", input: [1, 2, 3, 4], expected: 6 },
    { name: "Negative numbers and zero", input: [-4, -3, 0, 2], expected: -2 },
    { name: "Empty array", input: [], expected: 0 },
  ],
} as const;

export type CodingCase = (typeof codingChallenge.cases)[number];
export type CodingCaseResult = { output: string; actual?: number };

export function summarizeCodingCases(results: readonly CodingCaseResult[]) {
  return results.map((result, index) => {
    const test = codingChallenge.cases[index];
    const passed = result.actual === test.expected;
    return [
      (passed ? "PASS" : "FAIL") + " " + test.name,
      "Input " + JSON.stringify(test.input),
      "Expected " + test.expected,
      "Received " + (result.actual ?? result.output.slice(0, 200)),
    ].join(". ");
  }).join("\n");
}
