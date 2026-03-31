package kr.io.flowmate.common.dto;

import java.util.List;

public record ListResponse<T>(List<T> items) {
}
