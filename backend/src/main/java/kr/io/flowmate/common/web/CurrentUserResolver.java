package kr.io.flowmate.common.web;

import kr.io.flowmate.auth.exception.AuthenticationFailedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class CurrentUserResolver {

    public String resolve() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()
                || auth instanceof AnonymousAuthenticationToken) {
            throw new AuthenticationFailedException("인증 정보가 없습니다.");
        }
        return (String) auth.getPrincipal();
    }
}
