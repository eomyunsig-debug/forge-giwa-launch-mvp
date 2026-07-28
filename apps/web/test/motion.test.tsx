import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MOTION_ENTER_MS,
  MOTION_EXIT_MS,
  MotionPresence,
  MotionSwap,
} from "../src/motion";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("motion presence", () => {
  it("keeps exiting content inert before unmounting it", async () => {
    vi.useFakeTimers();
    const view = render(
      <MotionPresence show>
        <button type="button">확인</button>
      </MotionPresence>,
    );

    view.rerender(
      <MotionPresence show={false}>
        <button type="button">확인</button>
      </MotionPresence>,
    );

    const exiting = screen.getByText("확인").parentElement;
    expect(exiting).toHaveAttribute("data-motion-state", "exit");
    expect(exiting).toHaveAttribute("aria-hidden", "true");
    expect(exiting).toHaveAttribute("inert");

    await act(() => vi.advanceTimersByTime(MOTION_EXIT_MS));
    expect(screen.queryByText("확인")).not.toBeInTheDocument();
  });

  it("cancels removal when content reopens during exit", async () => {
    vi.useFakeTimers();
    const view = render(
      <MotionPresence show>
        <span>신고 폼</span>
      </MotionPresence>,
    );

    view.rerender(
      <MotionPresence show={false}>
        <span>신고 폼</span>
      </MotionPresence>,
    );
    await act(() => vi.advanceTimersByTime(MOTION_EXIT_MS / 2));
    view.rerender(
      <MotionPresence show>
        <span>신고 폼</span>
      </MotionPresence>,
    );
    await act(() => vi.advanceTimersByTime(MOTION_ENTER_MS));

    expect(screen.getByText("신고 폼").parentElement).toHaveAttribute(
      "data-motion-state",
      "entered",
    );
  });

  it("removes content without a visual delay for reduced motion", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    const view = render(
      <MotionPresence show>
        <span>즉시 닫기</span>
      </MotionPresence>,
    );

    view.rerender(
      <MotionPresence show={false}>
        <span>즉시 닫기</span>
      </MotionPresence>,
    );
    await act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByText("즉시 닫기")).not.toBeInTheDocument();
  });
});

describe("motion swap", () => {
  it("shows the new state immediately while the previous state exits inert", async () => {
    vi.useFakeTimers();
    const view = render(
      <MotionSwap motionKey="loading">
        <span>불러오는 중</span>
      </MotionSwap>,
    );

    view.rerender(
      <MotionSwap motionKey="ready">
        <span>준비됨</span>
      </MotionSwap>,
    );

    expect(screen.getByText("준비됨")).toBeInTheDocument();
    const outgoing = screen.getByText("불러오는 중").parentElement;
    expect(outgoing).toHaveClass("motion-swap__outgoing");
    expect(outgoing).toHaveAttribute("aria-hidden", "true");
    expect(outgoing).toHaveAttribute("inert");

    await act(() => vi.advanceTimersByTime(MOTION_EXIT_MS));
    expect(screen.queryByText("불러오는 중")).not.toBeInTheDocument();
  });

  it("preserves focus when an interactive state swaps", () => {
    const view = render(
      <MotionSwap motionKey="quote">
        <button type="button">견적 확인</button>
      </MotionSwap>,
    );
    screen.getByRole("button", { name: "견적 확인" }).focus();

    view.rerender(
      <MotionSwap motionKey="execute">
        <button type="button">매수 확인</button>
      </MotionSwap>,
    );

    expect(screen.getByRole("button", { name: "매수 확인" })).toHaveFocus();
  });

  it("removes an active outgoing state when reduced motion turns on", async () => {
    vi.useFakeTimers();
    let reduced = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        get matches() {
          return reduced;
        },
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: (_event: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) =>
          listeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const view = render(
      <MotionSwap motionKey="loading">
        <span>이전 상태</span>
      </MotionSwap>,
    );

    view.rerender(
      <MotionSwap motionKey="ready">
        <span>현재 상태</span>
      </MotionSwap>,
    );
    expect(screen.getByText("이전 상태")).toBeInTheDocument();

    act(() => {
      reduced = true;
      listeners.forEach((listener) => listener());
    });
    await act(() => vi.advanceTimersByTime(0));

    expect(screen.queryByText("이전 상태")).not.toBeInTheDocument();
    expect(screen.getByText("현재 상태")).toBeInTheDocument();
  });
});
