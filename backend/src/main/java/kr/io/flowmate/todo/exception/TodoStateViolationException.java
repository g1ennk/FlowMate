package kr.io.flowmate.todo.exception;

public class TodoStateViolationException extends RuntimeException {
    public TodoStateViolationException(String message) {
        super(message);
    }
}
