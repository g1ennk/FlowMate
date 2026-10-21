package kr.io.flowmate.auth.service;

import kr.io.flowmate.auth.domain.SocialAccount;
import kr.io.flowmate.auth.domain.User;
import kr.io.flowmate.auth.oauth.OAuthUserInfo;
import kr.io.flowmate.auth.repository.SocialAccountRepository;
import kr.io.flowmate.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * 소셜 계정 첫 로그인의 회원 생성을 로그인 트랜잭션과 분리된 새 트랜잭션에서 처리한다.
 * 같은 소셜 계정의 첫 로그인이 동시에 들어와 uq_provider_user 충돌이 나면, 진 요청의 이 트랜잭션만 롤백된다
 * (먼저 만든 User 행도 함께 롤백되어 고아 회원이 남지 않는다).
 */
@Service
@RequiredArgsConstructor
public class SocialAccountRegistrar {

    private final UserRepository userRepository;
    private final SocialAccountRepository socialAccountRepository;

    /** User + SocialAccount를 만들고 바로 커밋한다. 충돌이 이 메서드 안에서 드러나도록 flush 한다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public User register(String provider, OAuthUserInfo userInfo) {
        User user = userRepository.save(User.create(userInfo.email(), userInfo.nickname()));
        socialAccountRepository.saveAndFlush(SocialAccount.create(user.getId(), provider, userInfo.providerId()));
        return user;
    }

    /** 먼저 가입한 요청이 커밋한 회원을 읽는다. 새 트랜잭션이라 로그인 트랜잭션의 스냅샷과 상관없이 보인다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, readOnly = true)
    public Optional<User> findRegistered(String provider, String providerUserId) {
        return socialAccountRepository.findByProviderAndProviderUserId(provider, providerUserId)
                .flatMap(account -> userRepository.findById(account.getUserId()));
    }
}
