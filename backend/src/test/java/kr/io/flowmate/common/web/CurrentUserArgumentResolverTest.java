package kr.io.flowmate.common.web;

import kr.io.flowmate.common.annotation.CurrentUser;
import kr.io.flowmate.common.util.CurrentUserResolver;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CurrentUserArgumentResolverTest {

    @Test
    void supportsParameter_returnsTrueForCurrentUserStringParameter() throws NoSuchMethodException {
        CurrentUserResolver delegate = mock(CurrentUserResolver.class);
        CurrentUserArgumentResolver resolver = new CurrentUserArgumentResolver(delegate);
        MethodParameter param = new MethodParameter(
                TestController.class.getMethod("handler", String.class), 0);

        assertThat(resolver.supportsParameter(param)).isTrue();
    }

    @Test
    void supportsParameter_returnsFalseWhenAnnotationMissing() throws NoSuchMethodException {
        CurrentUserResolver delegate = mock(CurrentUserResolver.class);
        CurrentUserArgumentResolver resolver = new CurrentUserArgumentResolver(delegate);
        MethodParameter param = new MethodParameter(
                TestController.class.getMethod("noAnnotation", String.class), 0);

        assertThat(resolver.supportsParameter(param)).isFalse();
    }

    @Test
    void supportsParameter_returnsFalseWhenNotString() throws NoSuchMethodException {
        CurrentUserResolver delegate = mock(CurrentUserResolver.class);
        CurrentUserArgumentResolver resolver = new CurrentUserArgumentResolver(delegate);
        MethodParameter param = new MethodParameter(
                TestController.class.getMethod("wrongType", Long.class), 0);

        assertThat(resolver.supportsParameter(param)).isFalse();
    }

    @Test
    void resolveArgument_delegatesToCurrentUserResolver() throws Exception {
        CurrentUserResolver delegate = mock(CurrentUserResolver.class);
        when(delegate.resolve()).thenReturn("user-123");
        CurrentUserArgumentResolver resolver = new CurrentUserArgumentResolver(delegate);

        Object result = resolver.resolveArgument(null, null, null, null);

        assertThat(result).isEqualTo("user-123");
        verify(delegate).resolve();
    }

    static class TestController {
        public void handler(@CurrentUser String userId) {
        }

        public void noAnnotation(String userId) {
        }

        public void wrongType(@CurrentUser Long userId) {
        }
    }
}
