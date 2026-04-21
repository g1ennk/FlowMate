package kr.io.flowmate.todo.exception;

import kr.io.flowmate.common.exception.NotFoundException;

public class TodoNotFoundException extends NotFoundException {

    public TodoNotFoundException(String todoId) {
        super(String.format("Todo를 찾을 수 없습니다. (id: %s)", todoId));
    }

}
